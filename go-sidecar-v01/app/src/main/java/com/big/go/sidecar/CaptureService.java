package com.big.go.sidecar;

import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.util.DisplayMetrics;
import android.view.WindowManager;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;

public class CaptureService extends Service {
    static final String EXTRA_RESULT_CODE = "result_code";
    static final String EXTRA_RESULT_DATA = "result_data";
    private HandlerThread thread;
    private Handler handler;
    private MediaProjection projection;
    private VirtualDisplay virtualDisplay;
    private ImageReader reader;
    private boolean delivered;

    @Override
    public void onCreate() {
        super.onCreate();
        thread = new HandlerThread("GoSidecarCapture");
        thread.start();
        handler = new Handler(thread.getLooper());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(2002, NotificationHelper.capture(this), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        int resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, ActivityResultCode.INVALID);
        Intent resultData = intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent.class);
        if (resultCode == ActivityResultCode.INVALID || resultData == null) {
            fail("ไม่ได้รับสิทธิ์จับหน้าจอ");
            return START_NOT_STICKY;
        }
        try {
            MediaProjectionManager mpm = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
            projection = mpm.getMediaProjection(resultCode, resultData);
            projection.registerCallback(new MediaProjection.Callback() {
                @Override public void onStop() { cleanup(); }
            }, handler);
            startSingleFrameCapture();
        } catch (Exception e) {
            fail(e.getMessage());
        }
        return START_NOT_STICKY;
    }

    private void startSingleFrameCapture() {
        WindowManager wm = getSystemService(WindowManager.class);
        int width;
        int height;
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            Rect b = wm.getMaximumWindowMetrics().getBounds();
            width = b.width();
            height = b.height();
        } else {
            DisplayMetrics dm = new DisplayMetrics();
            wm.getDefaultDisplay().getRealMetrics(dm);
            width = dm.widthPixels;
            height = dm.heightPixels;
        }
        int density = getResources().getDisplayMetrics().densityDpi;
        reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2);
        reader.setOnImageAvailableListener(r -> {
            if (delivered) return;
            Image image = r.acquireLatestImage();
            if (image == null) return;
            delivered = true;
            try {
                File file = imageToPng(image, width, height);
                Intent ready = new Intent(this, BubbleService.class)
                        .setAction(BubbleService.ACTION_CAPTURE_READY)
                        .putExtra(BubbleService.EXTRA_CAPTURE_PATH, file.getAbsolutePath());
                startService(ready);
            } catch (Exception e) {
                fail(e.getMessage());
            } finally {
                image.close();
                cleanup();
                stopSelf();
            }
        }, handler);
        virtualDisplay = projection.createVirtualDisplay(
                "GO Sidecar single frame",
                width,
                height,
                density,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                reader.getSurface(),
                null,
                handler);
    }

    private File imageToPng(Image image, int width, int height) throws Exception {
        Image.Plane plane = image.getPlanes()[0];
        ByteBuffer buffer = plane.getBuffer();
        int pixelStride = plane.getPixelStride();
        int rowStride = plane.getRowStride();
        int rowPadding = rowStride - pixelStride * width;
        Bitmap padded = Bitmap.createBitmap(width + rowPadding / pixelStride, height, Bitmap.Config.ARGB_8888);
        padded.copyPixelsFromBuffer(buffer);
        Bitmap cropped = Bitmap.createBitmap(padded, 0, 0, width, height);
        padded.recycle();
        File file = new File(getCacheDir(), "go-capture-" + System.currentTimeMillis() + ".png");
        try (FileOutputStream out = new FileOutputStream(file)) {
            cropped.compress(Bitmap.CompressFormat.PNG, 96, out);
        }
        cropped.recycle();
        return file;
    }

    private void fail(String message) {
        Intent failed = new Intent(this, BubbleService.class)
                .setAction(BubbleService.ACTION_CAPTURE_FAILED)
                .putExtra(BubbleService.EXTRA_ERROR, message == null ? "จับภาพไม่สำเร็จ" : message);
        startService(failed);
        cleanup();
        stopSelf();
    }

    private void cleanup() {
        try { if (virtualDisplay != null) virtualDisplay.release(); } catch (Exception ignored) {}
        virtualDisplay = null;
        try { if (reader != null) reader.close(); } catch (Exception ignored) {}
        reader = null;
        try { if (projection != null) projection.stop(); } catch (Exception ignored) {}
        projection = null;
    }

    @Override
    public void onDestroy() {
        cleanup();
        if (thread != null) thread.quitSafely();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    private static final class ActivityResultCode {
        static final int INVALID = Integer.MIN_VALUE;
    }
}
