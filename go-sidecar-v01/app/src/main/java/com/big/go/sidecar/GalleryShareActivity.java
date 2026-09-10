package com.big.go.sidecar;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

import com.big.go.sidecar.core.GallerySharePolicy;

public final class GalleryShareActivity extends Activity {
    private static final int RC_PICK_IMAGE = 73;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (savedInstanceState == null) openImagePicker();
    }

    private void openImagePicker() {
        Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType(GallerySharePolicy.IMAGE_MIME);
        try {
            startActivityForResult(pick, RC_PICK_IMAGE);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "ไม่พบตัวเลือกรูปในเครื่อง", Toast.LENGTH_LONG).show();
            finish();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != RC_PICK_IMAGE) return;

        Uri image = resultCode == RESULT_OK && data != null ? data.getData() : null;
        if (image == null) {
            finish();
            return;
        }
        shareToChatGpt(image);
    }

    private void shareToChatGpt(Uri image) {
        Intent share = new Intent(Intent.ACTION_SEND)
                .setType(GallerySharePolicy.IMAGE_MIME)
                .putExtra(Intent.EXTRA_STREAM, image)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        share.setClipData(ClipData.newRawUri("GO gallery image", image));

        Intent direct = new Intent(share).setPackage(GallerySharePolicy.CHATGPT_PACKAGE);
        try {
            startActivity(direct);
        } catch (ActivityNotFoundException noChatGpt) {
            try {
                startActivity(Intent.createChooser(share, "ส่งรูปไป ChatGPT"));
            } catch (ActivityNotFoundException noShareTarget) {
                Toast.makeText(this, "ไม่พบแอปที่รับรูปนี้ได้", Toast.LENGTH_LONG).show();
            }
        }
        finish();
    }
}
