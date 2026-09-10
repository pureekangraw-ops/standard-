package com.big.go.sidecar;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.widget.Toast;

import com.big.go.sidecar.core.ReminderSchedule;

public final class ReminderActionActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String id = getIntent() == null
                ? null
                : getIntent().getStringExtra(ReminderScheduler.EXTRA_REMINDER_ID);
        ReminderSchedule reminder = new ReminderStore(this).get(id);
        if (reminder == null) {
            Toast.makeText(this, "ไม่พบ Reminder นี้", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard != null) {
            clipboard.setPrimaryClip(ClipData.newPlainText("GO Reminder · " + reminder.title, reminder.prompt));
        }

        Intent launch = getPackageManager().getLaunchIntentForPackage("com.openai.chatgpt");
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(launch);
            Toast.makeText(this, "คัดลอก Prompt แล้ว — วางในห้องที่ต้องการเอง", Toast.LENGTH_LONG).show();
        } else {
            Toast.makeText(this, "คัดลอก Prompt แล้ว · ไม่พบแอป ChatGPT", Toast.LENGTH_LONG).show();
        }
        finish();
    }
}
