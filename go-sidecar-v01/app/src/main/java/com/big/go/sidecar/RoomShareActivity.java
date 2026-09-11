package com.big.go.sidecar;

import android.app.Activity;
import android.content.ActivityNotFoundException;
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
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import com.big.go.sidecar.core.CropSelection;
import com.big.go.sidecar.core.IncomingSharePolicy;
import com.big.go.sidecar.core.ModePromptCatalog;
import com.big.go.sidecar.core.ModeSharePayload;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/** Receives screenshots/images, optionally masks the first image, then routes them through one GO room. */
public final class RoomShareActivity extends Activity {
    public static final String EXTRA_SOURCE_LABEL = "source_label";
    private static final int MIN_MASK_PX = 18;

    private final ArrayList<Uri> images = new ArrayList<>();
    private final ArrayList<CropSelection> masks = new ArrayList<>();
    private Bitmap previewBitmap;
    private MaskView maskView;
    private EditText request;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        collectImages(getIntent());
        if (!IncomingSharePolicy.isSupported(getIntent().getAction(), getIntent().getType(), images.size())) {
            Toast.makeText(this, "GO รับภาพครั้งละ 1–10 รูป", Toast.LENGTH_LONG).show();
            finish();
            return;
        }
        buildScreen();
    }

    @SuppressWarnings("deprecation")
    private void collectImages(Intent intent) {
        ArrayList<Uri> candidates = new ArrayList<>();
        if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
            ArrayList<Uri> shared = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (shared != null) candidates.addAll(shared);
        } else {
            Uri one = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (one != null) candidates.add(one);
        }
        ArrayList<String> values = new ArrayList<>();
        for (Uri uri : candidates) values.add(uri == null ? "" : uri.toString());
        for (String value : IncomingSharePolicy.uniqueUris(values)) images.add(Uri.parse(value));
    }

    private void buildScreen() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(14), dp(14), dp(14), dp(14));
        root.setBackgroundColor(0xfff8fafc);

        TextView title = text("ส่งภาพเข้า GO ห้องไหน", 21, Color.BLACK, true);
        root.addView(title);
        String source = getIntent().getStringExtra(EXTRA_SOURCE_LABEL);
        String detail = images.size() + " รูป" + (source == null ? "" : " · " + source);
        root.addView(text(detail, 14, 0xff475569, false));

        previewBitmap = decodePreview(images.get(0));
        if (previewBitmap != null) {
            maskView = new MaskView();
            LinearLayout.LayoutParams imageParams = new LinearLayout.LayoutParams(-1, 0, 1f);
            imageParams.setMargins(0, dp(10), 0, dp(8));
            root.addView(maskView, imageParams);

            LinearLayout privacy = new LinearLayout(this);
            privacy.setOrientation(LinearLayout.HORIZONTAL);
            Button clear = button("ล้างจุดปิดบัง");
            clear.setOnClickListener(v -> { masks.clear(); maskView.invalidate(); });
            privacy.addView(clear, new LinearLayout.LayoutParams(0, -2, 1f));
            TextView hint = text("ลากทับข้อมูลลับ", 13, 0xffb91c1c, true);
            hint.setGravity(Gravity.CENTER);
            privacy.addView(hint, new LinearLayout.LayoutParams(0, -1, 1f));
            root.addView(privacy);
        }

        request = new EditText(this);
        request.setHint("สั่ง GO เพิ่มได้ เช่น ช่วยดูว่าควรตอบอย่างไร");
        String sharedText = getIntent().getStringExtra(Intent.EXTRA_TEXT);
        if (sharedText != null) request.setText(sharedText);
        request.setMinLines(2);
        root.addView(request, new LinearLayout.LayoutParams(-1, -2));

        ScrollView modeScroll = new ScrollView(this);
        LinearLayout modes = new LinearLayout(this);
        modes.setOrientation(LinearLayout.VERTICAL);
        for (ModePromptCatalog.ModePrompt mode : ModePromptCatalog.all()) {
            Button choose = button(mode.label);
            choose.setOnClickListener(v -> route(mode));
            modes.addView(choose, new LinearLayout.LayoutParams(-1, -2));
        }
        Button cancel = button("ยกเลิก");
        cancel.setOnClickListener(v -> finish());
        modes.addView(cancel, new LinearLayout.LayoutParams(-1, -2));
        modeScroll.addView(modes);
        root.addView(modeScroll, new LinearLayout.LayoutParams(-1, -2));
        setContentView(root);
    }

    private void route(ModePromptCatalog.ModePrompt mode) {
        ArrayList<Uri> outgoing = new ArrayList<>(images);
        if (!masks.isEmpty() && previewBitmap != null) {
            Uri masked = saveMaskedCopy();
            if (masked == null) return;
            outgoing.set(0, masked);
        }

        Intent share = new Intent(outgoing.size() == 1 ? Intent.ACTION_SEND : Intent.ACTION_SEND_MULTIPLE)
                .setType("image/*")
                .putExtra(Intent.EXTRA_TEXT, ModeSharePayload.format(mode, request.getText().toString()))
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        if (outgoing.size() == 1) share.putExtra(Intent.EXTRA_STREAM, outgoing.get(0));
        else share.putParcelableArrayListExtra(Intent.EXTRA_STREAM, outgoing);

        ClipData grants = ClipData.newRawUri("GO room image", outgoing.get(0));
        for (int i = 1; i < outgoing.size(); i++) grants.addItem(new ClipData.Item(outgoing.get(i)));
        share.setClipData(grants);

        try {
            startActivity(new Intent(share).setPackage("com.openai.chatgpt"));
            Toast.makeText(this, mode.label + " · ตรวจห้องแล้วกดส่ง", Toast.LENGTH_LONG).show();
        } catch (ActivityNotFoundException noChatGpt) {
            try {
                startActivity(Intent.createChooser(share, "ส่งภาพเข้า " + mode.label));
            } catch (ActivityNotFoundException noTarget) {
                Toast.makeText(this, "ไม่พบแอปที่รับภาพ", Toast.LENGTH_LONG).show();
                return;
            }
        }
        finish();
    }

    private Uri saveMaskedCopy() {
        try {
            Bitmap output = previewBitmap.copy(Bitmap.Config.ARGB_8888, true);
            Canvas canvas = new Canvas(output);
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
            paint.setColor(Color.BLACK);
            for (CropSelection mask : masks) {
                canvas.drawRect(mask.left, mask.top, mask.right, mask.bottom, paint);
            }
            File file = new File(getCacheDir(), "go-capture-redacted-" + System.currentTimeMillis() + ".png");
            try (FileOutputStream out = new FileOutputStream(file)) {
                output.compress(Bitmap.CompressFormat.PNG, 100, out);
            }
            output.recycle();
            return new Uri.Builder().scheme("content")
                    .authority(getPackageName() + ".capture")
                    .appendPath(file.getName()).build();
        } catch (Exception e) {
            Toast.makeText(this, "ปิดบังภาพไม่สำเร็จ", Toast.LENGTH_LONG).show();
            return null;
        }
    }

    private Bitmap decodePreview(Uri uri) {
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            return BitmapFactory.decodeStream(in);
        } catch (Exception ignored) {
            return null;
        }
    }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        if (bold) view.setTypeface(null, 1);
        return view;
    }

    private Button button(String value) {
        Button button = new Button(this);
        button.setText(value);
        button.setAllCaps(false);
        return button;
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    @Override
    protected void onDestroy() {
        if (previewBitmap != null && !previewBitmap.isRecycled()) previewBitmap.recycle();
        super.onDestroy();
    }

    private final class MaskView extends View {
        private final Paint imagePaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        private final Paint maskPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF imageRect = new RectF();
        private final RectF dragRect = new RectF();
        private float scale = 1f;
        private float startX;
        private float startY;
        private boolean dragging;

        MaskView() {
            super(RoomShareActivity.this);
            maskPaint.setColor(Color.BLACK);
        }

        @Override protected void onSizeChanged(int w, int h, int oldw, int oldh) {
            if (previewBitmap == null || w <= 0 || h <= 0) return;
            scale = Math.min((float) w / previewBitmap.getWidth(), (float) h / previewBitmap.getHeight());
            float width = previewBitmap.getWidth() * scale;
            float height = previewBitmap.getHeight() * scale;
            imageRect.set((w - width) / 2f, (h - height) / 2f, (w + width) / 2f, (h + height) / 2f);
        }

        @Override protected void onDraw(Canvas canvas) {
            if (previewBitmap == null) return;
            canvas.drawBitmap(previewBitmap, null, imageRect, imagePaint);
            for (CropSelection mask : masks) {
                canvas.drawRect(imageRect.left + mask.left * scale, imageRect.top + mask.top * scale,
                        imageRect.left + mask.right * scale, imageRect.top + mask.bottom * scale, maskPaint);
            }
            if (dragging) canvas.drawRect(dragRect, maskPaint);
        }

        @Override public boolean onTouchEvent(MotionEvent event) {
            float x = Math.max(imageRect.left, Math.min(event.getX(), imageRect.right));
            float y = Math.max(imageRect.top, Math.min(event.getY(), imageRect.bottom));
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    if (!imageRect.contains(event.getX(), event.getY())) return false;
                    startX = x; startY = y; dragging = true; dragRect.set(x, y, x, y); invalidate(); return true;
                case MotionEvent.ACTION_MOVE:
                    if (!dragging) return false;
                    dragRect.set(Math.min(startX, x), Math.min(startY, y), Math.max(startX, x), Math.max(startY, y));
                    invalidate(); return true;
                case MotionEvent.ACTION_UP:
                    if (!dragging) return false;
                    dragging = false;
                    CropSelection mask = CropSelection.fromDrag(
                            (startX - imageRect.left) / scale, (startY - imageRect.top) / scale,
                            (x - imageRect.left) / scale, (y - imageRect.top) / scale,
                            previewBitmap.getWidth(), previewBitmap.getHeight(), MIN_MASK_PX);
                    if (mask.isValid()) masks.add(mask);
                    dragRect.setEmpty(); invalidate(); return true;
                case MotionEvent.ACTION_CANCEL:
                    dragging = false; dragRect.setEmpty(); invalidate(); return true;
                default: return true;
            }
        }
    }
}
