package com.big.go.sidecar;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

import com.big.go.sidecar.core.CropSelection;

import java.io.File;
import java.io.FileOutputStream;

public class QuickCropActivity extends Activity {
    static final String EXTRA_CAPTURE_PATH = "capture_path";
    private static final int MIN_SELECTION_PX = 24;

    private File sourceFile;
    private Bitmap screenshot;
    private boolean shared;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);

        String path = getIntent().getStringExtra(EXTRA_CAPTURE_PATH);
        if (path == null) {
            failAndFinish("ไม่พบภาพสำหรับ Quick Crop");
            return;
        }

        sourceFile = new File(path);
        screenshot = BitmapFactory.decodeFile(path);
        if (screenshot == null) {
            failAndFinish("เปิดภาพที่จับไว้ไม่สำเร็จ");
            return;
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        CropView cropView = new CropView();
        root.addView(cropView, new FrameLayout.LayoutParams(-1, -1));

        TextView hint = new TextView(this);
        hint.setText("ลากครอบส่วนที่ต้องการ · ปล่อยนิ้วเพื่อส่งเข้า ChatGPT · ย้อนกลับเพื่อยกเลิก");
        hint.setTextColor(Color.WHITE);
        hint.setTextSize(15);
        hint.setGravity(Gravity.CENTER);
        hint.setPadding(dp(14), dp(10), dp(14), dp(10));
        hint.setBackgroundColor(0xaa111827);
        FrameLayout.LayoutParams hintParams = new FrameLayout.LayoutParams(-1, -2, Gravity.TOP);
        hintParams.setMargins(dp(12), dp(12), dp(12), 0);
        root.addView(hint, hintParams);

        setContentView(root);
    }

    private void shareSelection(CropSelection selection) {
        if (shared || screenshot == null || !selection.isValid()) return;
        shared = true;

        try {
            Bitmap cropped = Bitmap.createBitmap(
                    screenshot,
                    selection.left,
                    selection.top,
                    selection.width(),
                    selection.height());
            File output = new File(getCacheDir(), "go-capture-crop-" + System.currentTimeMillis() + ".png");
            try (FileOutputStream out = new FileOutputStream(output)) {
                cropped.compress(Bitmap.CompressFormat.PNG, 100, out);
            }
            cropped.recycle();
            if (sourceFile != null) sourceFile.delete();

            Uri image = new Uri.Builder()
                    .scheme("content")
                    .authority(getPackageName() + ".capture")
                    .appendPath(output.getName())
                    .build();

            Intent share = new Intent(Intent.ACTION_SEND)
                    .setType("image/png")
                    .putExtra(Intent.EXTRA_STREAM, image)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            share.setClipData(ClipData.newUri(getContentResolver(), "GO Quick Crop", image));

            share.setClass(this, RoomShareActivity.class)
                    .putExtra(RoomShareActivity.EXTRA_SOURCE_LABEL, "Quick Crop");
            startActivity(share);
            finish();
        } catch (Exception e) {
            shared = false;
            Toast.makeText(this,
                    "Quick Crop ไม่สำเร็จ: " + (e.getMessage() == null ? "unknown error" : e.getMessage()),
                    Toast.LENGTH_LONG).show();
        }
    }

    private void failAndFinish(String message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
        finish();
    }

    @Override
    protected void onDestroy() {
        if (!shared && sourceFile != null) sourceFile.delete();
        if (screenshot != null && !screenshot.isRecycled()) screenshot.recycle();
        screenshot = null;
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private final class CropView extends View {
        private final Paint imagePaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        private final Paint fillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint borderPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF imageRect = new RectF();
        private final RectF selectionRect = new RectF();
        private float imageScale = 1f;
        private float startX;
        private float startY;
        private boolean dragging;

        CropView() {
            super(QuickCropActivity.this);
            fillPaint.setColor(0x44ffffff);
            fillPaint.setStyle(Paint.Style.FILL);
            borderPaint.setColor(Color.WHITE);
            borderPaint.setStyle(Paint.Style.STROKE);
            borderPaint.setStrokeWidth(dp(3));
        }

        @Override
        protected void onSizeChanged(int w, int h, int oldw, int oldh) {
            super.onSizeChanged(w, h, oldw, oldh);
            if (screenshot == null || w <= 0 || h <= 0) return;
            imageScale = Math.min((float) w / screenshot.getWidth(), (float) h / screenshot.getHeight());
            float drawnWidth = screenshot.getWidth() * imageScale;
            float drawnHeight = screenshot.getHeight() * imageScale;
            float left = (w - drawnWidth) / 2f;
            float top = (h - drawnHeight) / 2f;
            imageRect.set(left, top, left + drawnWidth, top + drawnHeight);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            if (screenshot == null) return;
            canvas.drawBitmap(screenshot, null, imageRect, imagePaint);
            if (dragging) {
                canvas.drawRect(selectionRect, fillPaint);
                canvas.drawRect(selectionRect, borderPaint);
            }
        }

        @Override
        public boolean onTouchEvent(MotionEvent event) {
            if (screenshot == null || imageRect.isEmpty()) return false;
            float x = clamp(event.getX(), imageRect.left, imageRect.right);
            float y = clamp(event.getY(), imageRect.top, imageRect.bottom);

            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    if (!imageRect.contains(event.getX(), event.getY())) return false;
                    startX = x;
                    startY = y;
                    selectionRect.set(x, y, x, y);
                    dragging = true;
                    invalidate();
                    return true;
                case MotionEvent.ACTION_MOVE:
                    if (!dragging) return false;
                    selectionRect.set(
                            Math.min(startX, x),
                            Math.min(startY, y),
                            Math.max(startX, x),
                            Math.max(startY, y));
                    invalidate();
                    return true;
                case MotionEvent.ACTION_UP:
                    if (!dragging) return false;
                    dragging = false;
                    CropSelection selection = CropSelection.fromDrag(
                            toImageX(startX),
                            toImageY(startY),
                            toImageX(x),
                            toImageY(y),
                            screenshot.getWidth(),
                            screenshot.getHeight(),
                            MIN_SELECTION_PX);
                    if (!selection.isValid()) {
                        selectionRect.setEmpty();
                        invalidate();
                        Toast.makeText(QuickCropActivity.this,
                                "ครอบพื้นที่ให้ใหญ่กว่านี้นิดนึง",
                                Toast.LENGTH_SHORT).show();
                        return true;
                    }
                    shareSelection(selection);
                    return true;
                case MotionEvent.ACTION_CANCEL:
                    dragging = false;
                    selectionRect.setEmpty();
                    invalidate();
                    return true;
                default:
                    return true;
            }
        }

        private float toImageX(float viewX) {
            return (viewX - imageRect.left) / imageScale;
        }

        private float toImageY(float viewY) {
            return (viewY - imageRect.top) / imageScale;
        }

        private float clamp(float value, float min, float max) {
            return Math.max(min, Math.min(max, value));
        }
    }
}
