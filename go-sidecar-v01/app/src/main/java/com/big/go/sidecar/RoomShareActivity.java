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
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import com.big.go.sidecar.core.CropSelection;
import com.big.go.sidecar.core.ImageImportPolicy;
import com.big.go.sidecar.core.IncomingSharePolicy;
import com.big.go.sidecar.core.MaskStateCodec;
import com.big.go.sidecar.core.ModePromptCatalog;
import com.big.go.sidecar.core.ModeSharePayload;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Imports shared images into a safe local boundary, supports per-image masking, then routes one GO mode. */
public final class RoomShareActivity extends Activity {
    public static final String EXTRA_SOURCE_LABEL = "source_label";
    private static final String STATE_IMAGES = "room_share_images";
    private static final String STATE_MASKS = "room_share_masks";
    private static final String STATE_REQUEST = "room_share_request";
    private static final String STATE_INDEX = "room_share_index";
    private static final int MIN_MASK_PX = 18;
    private static final long CACHE_MAX_AGE_MS = 24L * 60L * 60L * 1000L;

    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final ArrayList<Uri> images = new ArrayList<>();
    private final ArrayList<ArrayList<CropSelection>> masksByImage = new ArrayList<>();
    private Bitmap previewBitmap;
    private MaskView maskView;
    private EditText request;
    private TextView imagePosition;
    private int imageIndex;
    private String pendingRequest = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        cleanupOldCacheFiles();

        if (savedInstanceState != null && restoreState(savedInstanceState)) {
            buildScreen();
            return;
        }

        ArrayList<Uri> incoming = collectIncoming(getIntent());
        if (!IncomingSharePolicy.isSupported(
                getIntent().getAction(), getIntent().getType(), incoming.size())) {
            fail("GO รับภาพครั้งละ 1–10 รูป");
            return;
        }
        for (Uri uri : incoming) {
            if (!ImageImportPolicy.isSupportedUri(uri.toString())) {
                fail("รับได้เฉพาะภาพที่ Android อนุญาตให้แชร์");
                return;
            }
        }
        String sharedText = getIntent().getStringExtra(Intent.EXTRA_TEXT);
        pendingRequest = sharedText == null ? "" : sharedText;
        showLoading();
        worker.execute(() -> importImages(incoming));
    }

    @SuppressWarnings("deprecation")
    private ArrayList<Uri> collectIncoming(Intent intent) {
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
        ArrayList<Uri> unique = new ArrayList<>();
        for (String value : IncomingSharePolicy.uniqueUris(values)) unique.add(Uri.parse(value));
        return unique;
    }

    private void showLoading() {
        LinearLayout loading = new LinearLayout(this);
        loading.setOrientation(LinearLayout.VERTICAL);
        loading.setGravity(Gravity.CENTER);
        loading.setPadding(dp(24), dp(24), dp(24), dp(24));
        loading.addView(new ProgressBar(this));
        loading.addView(text("GO กำลังเตรียมภาพอย่างปลอดภัย…", 16, Color.DKGRAY, true));
        setContentView(loading);
    }

    private void importImages(ArrayList<Uri> incoming) {
        ArrayList<Uri> imported = new ArrayList<>();
        try {
            for (Uri source : incoming) imported.add(importSafeCopy(source));
            runOnUiThread(() -> {
                images.addAll(imported);
                while (masksByImage.size() < images.size()) masksByImage.add(new ArrayList<>());
                buildScreen();
            });
        } catch (Exception error) {
            for (Uri uri : imported) deleteOwned(uri);
            runOnUiThread(() -> fail("เปิดภาพที่แชร์มาไม่สำเร็จหรือภาพใหญ่เกินไป"));
        }
    }

    private Uri importSafeCopy(Uri source) throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream in = getContentResolver().openInputStream(source)) {
            if (in == null) throw new IllegalArgumentException("unreadable image");
            BitmapFactory.decodeStream(in, null, bounds);
        }
        if (!ImageImportPolicy.isSafeDimensions(bounds.outWidth, bounds.outHeight)) {
            throw new IllegalArgumentException("unsafe image dimensions");
        }
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = ImageImportPolicy.sampleSize(bounds.outWidth, bounds.outHeight);
        Bitmap bitmap;
        try (InputStream in = getContentResolver().openInputStream(source)) {
            if (in == null) throw new IllegalArgumentException("unreadable image");
            bitmap = BitmapFactory.decodeStream(in, null, options);
        }
        if (bitmap == null) throw new IllegalArgumentException("unsupported image");
        File output = new File(getCacheDir(), "go-capture-import-" + System.nanoTime() + ".png");
        try (FileOutputStream out = new FileOutputStream(output)) {
            if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)) {
                throw new IllegalStateException("image encode failed");
            }
        } finally {
            bitmap.recycle();
        }
        return ownedUri(output);
    }

    private void buildScreen() {
        if (images.isEmpty()) {
            fail("ไม่พบภาพที่เตรียมไว้");
            return;
        }
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(14), dp(14), dp(14), dp(14));
        root.setBackgroundColor(0xfff8fafc);
        root.addView(text("ส่งภาพเข้า GO ห้องไหน", 21, Color.BLACK, true));

        imagePosition = text("", 14, 0xff475569, false);
        root.addView(imagePosition);

        maskView = new MaskView();
        LinearLayout.LayoutParams imageParams = new LinearLayout.LayoutParams(-1, 0, 1f);
        imageParams.setMargins(0, dp(10), 0, dp(8));
        root.addView(maskView, imageParams);

        LinearLayout imageTools = row();
        Button previous = button("‹ รูปก่อน");
        Button clear = button("ล้างจุดปิดบัง");
        Button next = button("รูปถัดไป ›");
        previous.setOnClickListener(v -> showImage(imageIndex - 1));
        clear.setOnClickListener(v -> {
            masksByImage.get(imageIndex).clear();
            maskView.invalidate();
        });
        next.setOnClickListener(v -> showImage(imageIndex + 1));
        imageTools.addView(previous, weight());
        imageTools.addView(clear, weight());
        imageTools.addView(next, weight());
        root.addView(imageTools);
        TextView privacy = text("ลากกรอบดำทับรหัสผ่าน OTP หรือข้อมูลส่วนตัวในแต่ละภาพ", 13, 0xffb91c1c, true);
        privacy.setGravity(Gravity.CENTER);
        root.addView(privacy);

        request = new EditText(this);
        request.setHint("สั่ง GO เพิ่มได้ เช่น ช่วยดูว่าควรตอบอย่างไร");
        request.setText(pendingRequest);
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
        showImage(Math.min(imageIndex, images.size() - 1));
    }

    private void showImage(int target) {
        if (target < 0 || target >= images.size()) return;
        if (previewBitmap != null && !previewBitmap.isRecycled()) previewBitmap.recycle();
        previewBitmap = decodeOwned(images.get(target));
        if (previewBitmap == null) {
            fail("เปิดภาพที่เตรียมไว้ไม่สำเร็จ");
            return;
        }
        imageIndex = target;
        imagePosition.setText("รูป " + (imageIndex + 1) + " จาก " + images.size());
        maskView.resetForImage();
    }

    private void route(ModePromptCatalog.ModePrompt mode) {
        pendingRequest = request.getText().toString();
        showLoading();
        worker.execute(() -> {
            try {
                ArrayList<Uri> outgoing = new ArrayList<>();
                for (int index = 0; index < images.size(); index++) {
                    if (masksByImage.get(index).isEmpty()) outgoing.add(images.get(index));
                    else outgoing.add(saveMaskedCopy(index));
                }
                runOnUiThread(() -> launchShare(mode, outgoing));
            } catch (Exception error) {
                runOnUiThread(() -> {
                    Toast.makeText(this, "ปิดบังภาพไม่สำเร็จ", Toast.LENGTH_LONG).show();
                    buildScreen();
                });
            }
        });
    }

    private Uri saveMaskedCopy(int index) throws Exception {
        Bitmap output = decodeOwned(images.get(index));
        if (output == null) throw new IllegalStateException("image decode failed");
        Canvas canvas = new Canvas(output);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(Color.BLACK);
        for (CropSelection mask : masksByImage.get(index)) {
            canvas.drawRect(mask.left, mask.top, mask.right, mask.bottom, paint);
        }
        File file = new File(getCacheDir(), "go-capture-redacted-" + System.nanoTime() + ".png");
        try (FileOutputStream out = new FileOutputStream(file)) {
            if (!output.compress(Bitmap.CompressFormat.PNG, 100, out)) {
                throw new IllegalStateException("image encode failed");
            }
        } finally {
            output.recycle();
        }
        return ownedUri(file);
    }

    private void launchShare(ModePromptCatalog.ModePrompt mode, ArrayList<Uri> outgoing) {
        Intent share = new Intent(outgoing.size() == 1 ? Intent.ACTION_SEND : Intent.ACTION_SEND_MULTIPLE)
                .setType("image/png")
                .putExtra(Intent.EXTRA_TEXT, ModeSharePayload.format(mode, pendingRequest))
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        if (outgoing.size() == 1) share.putExtra(Intent.EXTRA_STREAM, outgoing.get(0));
        else share.putParcelableArrayListExtra(Intent.EXTRA_STREAM, outgoing);
        ClipData grants = ClipData.newRawUri("GO room image", outgoing.get(0));
        for (int i = 1; i < outgoing.size(); i++) grants.addItem(new ClipData.Item(outgoing.get(i)));
        share.setClipData(grants);

        try {
            startActivity(new Intent(share).setPackage("com.openai.chatgpt"));
            Toast.makeText(this, mode.label + " · ตรวจห้องแล้วกดส่ง", Toast.LENGTH_LONG).show();
        } catch (ActivityNotFoundException | SecurityException noChatGpt) {
            try {
                startActivity(Intent.createChooser(share, "ส่งภาพเข้า " + mode.label));
            } catch (ActivityNotFoundException | SecurityException noTarget) {
                Toast.makeText(this, "ไม่พบแอปที่รับภาพ", Toast.LENGTH_LONG).show();
                buildScreen();
                return;
            }
        }
        finish();
    }

    private Bitmap decodeOwned(Uri uri) {
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            Bitmap decoded = BitmapFactory.decodeStream(in);
            return decoded == null ? null : decoded.copy(Bitmap.Config.ARGB_8888, true);
        } catch (Exception ignored) {
            return null;
        }
    }

    private Uri ownedUri(File file) {
        return new Uri.Builder().scheme("content")
                .authority(getPackageName() + ".capture")
                .appendPath(file.getName()).build();
    }

    private void deleteOwned(Uri uri) {
        String name = uri == null ? null : uri.getLastPathSegment();
        if (name != null && name.startsWith("go-capture-")) new File(getCacheDir(), name).delete();
    }

    private void cleanupOldCacheFiles() {
        File[] files = getCacheDir().listFiles((dir, name) ->
                name.startsWith("go-capture-import-") || name.startsWith("go-capture-redacted-"));
        if (files == null) return;
        long cutoff = System.currentTimeMillis() - CACHE_MAX_AGE_MS;
        for (File file : files) if (file.lastModified() < cutoff) file.delete();
    }

    private boolean restoreState(Bundle state) {
        ArrayList<String> storedImages = state.getStringArrayList(STATE_IMAGES);
        if (storedImages == null || storedImages.isEmpty()) return false;
        for (String value : storedImages) images.add(Uri.parse(value));
        while (masksByImage.size() < images.size()) masksByImage.add(new ArrayList<>());
        ArrayList<String> storedMasks = state.getStringArrayList(STATE_MASKS);
        if (storedMasks != null) {
            for (String value : storedMasks) {
                try {
                    MaskStateCodec.Decoded decoded = MaskStateCodec.decode(value);
                    if (decoded.imageIndex < masksByImage.size()) {
                        masksByImage.get(decoded.imageIndex).add(decoded.selection);
                    }
                } catch (IllegalArgumentException ignored) {}
            }
        }
        pendingRequest = state.getString(STATE_REQUEST, "");
        imageIndex = Math.max(0, Math.min(state.getInt(STATE_INDEX, 0), images.size() - 1));
        return true;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        ArrayList<String> storedImages = new ArrayList<>();
        for (Uri uri : images) storedImages.add(uri.toString());
        ArrayList<String> storedMasks = new ArrayList<>();
        for (int index = 0; index < masksByImage.size(); index++) {
            for (CropSelection mask : masksByImage.get(index)) {
                storedMasks.add(MaskStateCodec.encode(index, mask));
            }
        }
        outState.putStringArrayList(STATE_IMAGES, storedImages);
        outState.putStringArrayList(STATE_MASKS, storedMasks);
        outState.putString(STATE_REQUEST, request == null ? pendingRequest : request.getText().toString());
        outState.putInt(STATE_INDEX, imageIndex);
    }

    private void fail(String message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
        finish();
    }

    private LinearLayout row() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        return row;
    }

    private LinearLayout.LayoutParams weight() {
        return new LinearLayout.LayoutParams(0, -2, 1f);
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

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onDestroy() {
        worker.shutdownNow();
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

        void resetForImage() {
            dragRect.setEmpty();
            dragging = false;
            requestLayout();
            invalidate();
        }

        @Override
        protected void onSizeChanged(int width, int height, int oldWidth, int oldHeight) {
            if (previewBitmap == null || width <= 0 || height <= 0) return;
            scale = Math.min((float) width / previewBitmap.getWidth(), (float) height / previewBitmap.getHeight());
            float drawnWidth = previewBitmap.getWidth() * scale;
            float drawnHeight = previewBitmap.getHeight() * scale;
            imageRect.set((width - drawnWidth) / 2f, (height - drawnHeight) / 2f,
                    (width + drawnWidth) / 2f, (height + drawnHeight) / 2f);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            if (previewBitmap == null) return;
            canvas.drawBitmap(previewBitmap, null, imageRect, imagePaint);
            for (CropSelection mask : masksByImage.get(imageIndex)) {
                canvas.drawRect(imageRect.left + mask.left * scale, imageRect.top + mask.top * scale,
                        imageRect.left + mask.right * scale, imageRect.top + mask.bottom * scale, maskPaint);
            }
            if (dragging) canvas.drawRect(dragRect, maskPaint);
        }

        @Override
        public boolean onTouchEvent(MotionEvent event) {
            if (previewBitmap == null || imageRect.isEmpty()) return false;
            float x = Math.max(imageRect.left, Math.min(event.getX(), imageRect.right));
            float y = Math.max(imageRect.top, Math.min(event.getY(), imageRect.bottom));
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    if (!imageRect.contains(event.getX(), event.getY())) return false;
                    startX = x;
                    startY = y;
                    dragging = true;
                    dragRect.set(x, y, x, y);
                    invalidate();
                    return true;
                case MotionEvent.ACTION_MOVE:
                    if (!dragging) return false;
                    dragRect.set(Math.min(startX, x), Math.min(startY, y),
                            Math.max(startX, x), Math.max(startY, y));
                    invalidate();
                    return true;
                case MotionEvent.ACTION_UP:
                    if (!dragging) return false;
                    dragging = false;
                    CropSelection mask = CropSelection.fromDrag(
                            (startX - imageRect.left) / scale, (startY - imageRect.top) / scale,
                            (x - imageRect.left) / scale, (y - imageRect.top) / scale,
                            previewBitmap.getWidth(), previewBitmap.getHeight(), MIN_MASK_PX);
                    if (mask.isValid()) masksByImage.get(imageIndex).add(mask);
                    dragRect.setEmpty();
                    invalidate();
                    return true;
                case MotionEvent.ACTION_CANCEL:
                    dragging = false;
                    dragRect.setEmpty();
                    invalidate();
                    return true;
                default:
                    return true;
            }
        }
    }
}
