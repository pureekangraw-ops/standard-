package com.big.go.sidecar;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

import com.big.go.sidecar.core.GallerySelectionPolicy;
import com.big.go.sidecar.core.GallerySharePolicy;

import java.util.ArrayList;

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
                .setType(GallerySharePolicy.IMAGE_MIME)
                .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
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
        if (resultCode != RESULT_OK || data == null) {
            finish();
            return;
        }

        ArrayList<Uri> images = collectImages(data);
        if (!GallerySelectionPolicy.isValidCount(images.size())) {
            if (images.size() > GallerySelectionPolicy.MAX_IMAGES) {
                Toast.makeText(this, "เลือกได้สูงสุด " + GallerySelectionPolicy.MAX_IMAGES + " รูปต่อครั้ง", Toast.LENGTH_LONG).show();
            }
            finish();
            return;
        }
        shareToChatGpt(images);
    }

    private ArrayList<Uri> collectImages(Intent data) {
        ArrayList<Uri> images = new ArrayList<>();
        ClipData clip = data.getClipData();
        if (clip != null) {
            for (int i = 0; i < clip.getItemCount(); i++) {
                Uri image = clip.getItemAt(i).getUri();
                if (image != null && !images.contains(image)) images.add(image);
            }
        } else if (data.getData() != null) {
            images.add(data.getData());
        }
        return images;
    }

    private void shareToChatGpt(ArrayList<Uri> images) {
        String action = GallerySelectionPolicy.shareActionForCount(images.size());
        Intent share;
        if ("SEND_MULTIPLE".equals(action)) {
            share = new Intent(Intent.ACTION_SEND_MULTIPLE)
                    .setType(GallerySharePolicy.IMAGE_MIME)
                    .putParcelableArrayListExtra(Intent.EXTRA_STREAM, images);
        } else {
            share = new Intent(Intent.ACTION_SEND)
                    .setType(GallerySharePolicy.IMAGE_MIME)
                    .putExtra(Intent.EXTRA_STREAM, images.get(0));
        }
        share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

        ClipData grants = ClipData.newRawUri("GO gallery image", images.get(0));
        for (int i = 1; i < images.size(); i++) {
            grants.addItem(new ClipData.Item(images.get(i)));
        }
        share.setClipData(grants);

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
