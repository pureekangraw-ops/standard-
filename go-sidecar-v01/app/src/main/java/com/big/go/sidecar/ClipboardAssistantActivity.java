package com.big.go.sidecar;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import com.big.go.sidecar.core.ClipboardAssistantPolicy;

public final class ClipboardAssistantActivity extends Activity {
    private String clipboardText;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        clipboardText = readClipboardText();
        if (clipboardText == null || clipboardText.trim().isEmpty()) {
            Toast.makeText(this, "Clipboard ยังไม่มีข้อความ", Toast.LENGTH_LONG).show();
            finish();
            return;
        }
        setContentView(buildUi());
    }

    private String readClipboardText() {
        ClipboardManager cb = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (cb == null || !cb.hasPrimaryClip()) return null;
        ClipData clip = cb.getPrimaryClip();
        if (clip == null || clip.getItemCount() == 0) return null;
        CharSequence text = clip.getItemAt(0).coerceToText(this);
        return text == null ? null : text.toString();
    }

    private View buildUi() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(20), dp(20), dp(20));
        root.setBackgroundColor(Color.WHITE);
        scroll.addView(root, new ScrollView.LayoutParams(-1, -2));

        TextView title = new TextView(this);
        title.setText("Clipboard Assistant");
        title.setTextSize(24);
        title.setTextColor(Color.BLACK);
        title.setTypeface(null, 1);
        root.addView(title);

        TextView desc = new TextView(this);
        desc.setText("เลือกว่าจะเอาข้อความที่คัดลอกไปทำอะไร แล้ว GO Sidecar จะ Share เข้า ChatGPT โดยตรง — ไม่เรียก Sidecar API และอาจเปิดห้องใหม่");
        desc.setTextSize(14);
        desc.setTextColor(Color.DKGRAY);
        desc.setPadding(0, dp(8), 0, dp(12));
        root.addView(desc);

        TextView preview = new TextView(this);
        preview.setText(clipboardText);
        preview.setTextSize(15);
        preview.setTextColor(Color.BLACK);
        preview.setPadding(dp(12), dp(12), dp(12), dp(12));
        preview.setBackgroundColor(0xffeeeeee);
        root.addView(preview, new LinearLayout.LayoutParams(-1, -2));

        addAction(root, "ส่งข้อความเดิม", ClipboardAssistantPolicy.Action.SEND);
        addAction(root, "🧠 สรุป", ClipboardAssistantPolicy.Action.SUMMARIZE);
        addAction(root, "✍️ ร่างคำตอบ", ClipboardAssistantPolicy.Action.DRAFT_REPLY);
        addAction(root, "✅ ตรวจ", ClipboardAssistantPolicy.Action.CHECK);
        addAction(root, "🌐 แปล", ClipboardAssistantPolicy.Action.TRANSLATE);

        Button close = button("ปิด");
        close.setOnClickListener(v -> finish());
        root.addView(close);
        return scroll;
    }

    private void addAction(LinearLayout root, String label, ClipboardAssistantPolicy.Action action) {
        Button b = button(label);
        b.setOnClickListener(v -> share(action));
        root.addView(b, new LinearLayout.LayoutParams(-1, -2));
    }

    private void share(ClipboardAssistantPolicy.Action action) {
        String packaged;
        try {
            packaged = ClipboardAssistantPolicy.packageText(action, clipboardText);
        } catch (IllegalArgumentException e) {
            Toast.makeText(this, e.getMessage(), Toast.LENGTH_LONG).show();
            return;
        }

        Intent share = new Intent(Intent.ACTION_SEND)
                .setType("text/plain")
                .putExtra(Intent.EXTRA_TEXT, packaged);
        Intent direct = new Intent(share).setPackage("com.openai.chatgpt");
        try {
            startActivity(direct);
        } catch (ActivityNotFoundException noChatGpt) {
            try {
                startActivity(Intent.createChooser(share, "ส่งข้อความไป ChatGPT"));
            } catch (ActivityNotFoundException noShareTarget) {
                Toast.makeText(this, "ไม่พบแอปที่รับข้อความนี้ได้", Toast.LENGTH_LONG).show();
            }
        }
        finish();
    }

    private Button button(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        return b;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
