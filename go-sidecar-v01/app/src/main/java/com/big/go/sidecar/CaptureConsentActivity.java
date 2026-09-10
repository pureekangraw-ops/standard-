package com.big.go.sidecar;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.os.Bundle;

public class CaptureConsentActivity extends Activity {
    static final String EXTRA_FLOW = "flow";
    static final String FLOW_ANALYZE = "analyze";
    static final String FLOW_QUICK_CROP = "quick_crop";
    private static final int RC_CAPTURE = 42;

    private String flow = FLOW_ANALYZE;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String requestedFlow = getIntent().getStringExtra(EXTRA_FLOW);
        if (FLOW_QUICK_CROP.equals(requestedFlow)) flow = FLOW_QUICK_CROP;

        MediaProjectionManager mpm = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        startActivityForResult(mpm.createScreenCaptureIntent(), RC_CAPTURE);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == RC_CAPTURE && resultCode == RESULT_OK && data != null) {
            Intent capture = new Intent(this, CaptureService.class);
            capture.putExtra(CaptureService.EXTRA_RESULT_CODE, resultCode);
            capture.putExtra(CaptureService.EXTRA_RESULT_DATA, data);
            capture.putExtra(CaptureService.EXTRA_FLOW, flow);
            startForegroundService(capture);
        } else {
            Intent reset = new Intent(this, BubbleService.class).setAction(BubbleService.ACTION_CAPTURE_CANCELLED);
            startService(reset);
        }
        finish();
    }
}
