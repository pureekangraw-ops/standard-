package com.big.go.sidecar;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputType;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Space;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
    private TextView status;
    private EditText apiKey;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        NotificationHelper.ensureChannels(this);
        requestNotificationsIfNeeded();
        setContentView(buildUi());
        refreshStatus();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (status != null) refreshStatus();
    }

    private View buildUi() {
        int p = dp(20);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(p, p, p, p);
        root.setBackgroundColor(Color.WHITE);

        TextView title = new TextView(this);
        title.setText("GO Sidecar v0.1");
        title.setTextSize(28);
        title.setTextColor(Color.BLACK);
        title.setTypeface(null, 1);
        root.addView(title);

        TextView desc = new TextView(this);
        desc.setText("แตะ Bubble = ดูหน้าจอด้วย GO · กดค้าง Bubble = GO Modes / Quick Crop / รูปจากคลัง / Clipboard / Favorites / Schedule");
        desc.setTextSize(16);
        desc.setTextColor(Color.DKGRAY);
        desc.setPadding(0, dp(8), 0, dp(12));
        root.addView(desc);

        status = new TextView(this);
        status.setTextSize(15);
        status.setTextColor(Color.BLACK);
        status.setPadding(dp(12), dp(12), dp(12), dp(12));
        status.setBackgroundColor(0xffeeeeee);
        root.addView(status, new LinearLayout.LayoutParams(-1, -2));

        apiKey = new EditText(this);
        apiKey.setHint("วาง OpenAI API key เดิมที่นี่ (เก็บเข้ารหัสในเครื่อง)");
        apiKey.setSingleLine(true);
        apiKey.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        root.addView(apiKey, new LinearLayout.LayoutParams(-1, -2));

        Button saveKey = button("บันทึก API key เดิม");
        saveKey.setOnClickListener(v -> saveKey());
        root.addView(saveKey);

        Button clearKey = button("ลบ API key จากเครื่อง");
        clearKey.setOnClickListener(v -> {
            SecureKeyStore.clear(this);
            apiKey.setText("");
            refreshStatus();
            toast("ลบ key ที่เก็บในเครื่องแล้ว");
        });
        root.addView(clearKey);

        addSpace(root, 12);
        Button overlay = button("อนุญาตปุ่มลอยบนหน้าจอ");
        overlay.setOnClickListener(v -> requestOverlayPermission());
        root.addView(overlay);

        Button start = button("เปิด GO Sidecar");
        start.setOnClickListener(v -> startSidecar());
        root.addView(start);

        Button stop = button("ปิด GO Sidecar");
        stop.setOnClickListener(v -> stopService(new Intent(this, BubbleService.class)));
        root.addView(stop);

        addSpace(root, 12);
        TextView tools = new TextView(this);
        tools.setText("Productivity");
        tools.setTextSize(18);
        tools.setTextColor(Color.BLACK);
        tools.setTypeface(null, 1);
        root.addView(tools);

        Button favorites = button("⭐ Favorites / ปุ่มของบิ๊ก");
        favorites.setOnClickListener(v -> startActivity(new Intent(this, FavoritesActivity.class)));
        root.addView(favorites);

        Button schedule = button("⏰ Schedule / Reminder");
        schedule.setOnClickListener(v -> startActivity(new Intent(this, ScheduleActivity.class)));
        root.addView(schedule);

        addSpace(root, 14);
        TextView note = new TextView(this);
        note.setText("เลนห้องเดิม = GO Modes / Favorites / Reminder คัดลอก Prompt ให้ BIG วางเอง · Clipboard และรูปเป็น Share จึงอาจเปิดห้องใหม่ · ทั้ง Clipboard, Gallery, Favorites และ Schedule ไม่เรียก Sidecar API และไม่ส่งข้อความอัตโนมัติ · การวิเคราะห์ภาพจากการแตะ Bubble ยังใช้ Personal Direct Mode ผ่าน OpenAI API จากเครื่องนี้");
        note.setTextColor(Color.DKGRAY);
        note.setTextSize(13);
        root.addView(note);

        return root;
    }

    private void saveKey() {
        try {
            SecureKeyStore.save(this, apiKey.getText().toString());
            apiKey.setText("");
            refreshStatus();
            toast("บันทึก key เดิมแบบเข้ารหัสแล้ว");
        } catch (Exception e) {
            toast("บันทึกไม่สำเร็จ: " + e.getMessage());
        }
    }

    private void startSidecar() {
        if (!Settings.canDrawOverlays(this)) {
            toast("ต้องอนุญาตปุ่มลอยก่อน");
            requestOverlayPermission();
            return;
        }
        if (!SecureKeyStore.hasKey(this)) {
            toast("บันทึก API key เดิมก่อน");
            return;
        }
        Intent i = new Intent(this, BubbleService.class).setAction(BubbleService.ACTION_START);
        startForegroundService(i);
        toast("เปิด GO Sidecar แล้ว");
    }

    private void requestOverlayPermission() {
        Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()));
        startActivity(intent);
    }

    private void requestNotificationsIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 90);
        }
    }

    private void refreshStatus() {
        boolean overlay = Settings.canDrawOverlays(this);
        boolean key = SecureKeyStore.hasKey(this);
        status.setText("ปุ่มลอย: " + (overlay ? "พร้อม" : "ยังไม่อนุญาต") + "\nAPI key: " + (key ? "บันทึกไว้แล้ว" : "ยังไม่มี") + "\nโมเดล: gpt-5.6-luna");
    }

    private Button button(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        return b;
    }

    private void addSpace(LinearLayout root, int dp) {
        Space s = new Space(this);
        root.addView(s, new LinearLayout.LayoutParams(1, dp(dp)));
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }
    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_LONG).show(); }
}
