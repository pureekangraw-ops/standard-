package com.big.go.sidecar;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.TimePicker;
import android.widget.Toast;

import com.big.go.sidecar.core.ReminderSchedule;

import java.util.List;

public final class ScheduleActivity extends Activity {
    private static final String[] RECURRENCE_LABELS = {"ทุกวัน", "ทุกสัปดาห์"};
    private static final String[] DAY_LABELS = {
            "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"
    };

    private ReminderStore store;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        store = new ReminderStore(this);
        refresh();
    }

    private void refresh() {
        setContentView(buildUi());
    }

    private View buildUi() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(20), dp(20), dp(20));
        root.setBackgroundColor(Color.WHITE);
        scroll.addView(root, new ScrollView.LayoutParams(-1, -2));

        TextView title = text("Schedule · Reminder", 24, Color.BLACK, true);
        root.addView(title);

        TextView desc = text(
                "ตั้งเตือนในเครื่องได้หลายรายการ · ถึงเวลา GO แจ้งเตือนและเตรียม Prompt ให้ แต่จะไม่ส่งข้อความอัตโนมัติ",
                14,
                Color.DKGRAY,
                false);
        desc.setPadding(0, dp(8), 0, dp(12));
        root.addView(desc);

        List<ReminderSchedule> reminders = store.list();
        if (reminders.isEmpty()) {
            TextView empty = text("ยังไม่มี Reminder", 15, Color.DKGRAY, false);
            empty.setPadding(0, dp(8), 0, dp(10));
            root.addView(empty);
        }

        for (ReminderSchedule reminder : reminders) {
            String recurrence = reminder.recurrence == ReminderSchedule.Recurrence.DAILY
                    ? "ทุกวัน"
                    : "ทุก" + DAY_LABELS[reminder.dayOfWeek - 1];
            String state = reminder.enabled ? "ON" : "OFF";
            TextView summary = text(
                    reminder.title + " · " + String.format("%02d:%02d", reminder.hour, reminder.minute)
                            + " · " + recurrence + " · " + state,
                    16,
                    Color.BLACK,
                    true);
            summary.setPadding(0, dp(10), 0, dp(4));
            root.addView(summary);

            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);

            Button toggle = button(reminder.enabled ? "ปิดเตือน" : "เปิดเตือน");
            toggle.setOnClickListener(v -> toggle(reminder));
            row.addView(toggle, new LinearLayout.LayoutParams(0, -2, 1f));

            Button edit = button("แก้ไข");
            edit.setOnClickListener(v -> showEditor(reminder));
            row.addView(edit, new LinearLayout.LayoutParams(0, -2, 1f));

            Button delete = button("ลบ");
            delete.setOnClickListener(v -> confirmDelete(reminder));
            row.addView(delete, new LinearLayout.LayoutParams(0, -2, 1f));

            root.addView(row);
        }

        Button add = button("＋ เพิ่ม Reminder");
        add.setOnClickListener(v -> showEditor(null));
        root.addView(add, new LinearLayout.LayoutParams(-1, -2));

        Button close = button("ปิด");
        close.setOnClickListener(v -> finish());
        root.addView(close, new LinearLayout.LayoutParams(-1, -2));
        return scroll;
    }

    private void showEditor(ReminderSchedule existing) {
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(dp(18), dp(4), dp(18), 0);

        EditText title = new EditText(this);
        title.setHint("ชื่อเตือน เช่น เช็กการเงิน");
        if (existing != null) title.setText(existing.title);
        form.addView(title, new LinearLayout.LayoutParams(-1, -2));

        EditText prompt = new EditText(this);
        prompt.setHint("Prompt ที่จะคัดลอกเมื่อแตะ Reminder");
        prompt.setMinLines(4);
        if (existing != null) prompt.setText(existing.prompt);
        form.addView(prompt, new LinearLayout.LayoutParams(-1, -2));

        TimePicker time = new TimePicker(this);
        time.setIs24HourView(true);
        if (existing != null) {
            time.setHour(existing.hour);
            time.setMinute(existing.minute);
        }
        form.addView(time, new LinearLayout.LayoutParams(-1, -2));

        Spinner recurrence = new Spinner(this);
        recurrence.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, RECURRENCE_LABELS));
        recurrence.setSelection(existing != null && existing.recurrence == ReminderSchedule.Recurrence.WEEKLY ? 1 : 0);
        form.addView(recurrence, new LinearLayout.LayoutParams(-1, -2));

        Spinner day = new Spinner(this);
        day.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, DAY_LABELS));
        day.setSelection(existing == null ? 0 : existing.dayOfWeek - 1);
        form.addView(day, new LinearLayout.LayoutParams(-1, -2));

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle(existing == null ? "เพิ่ม Reminder" : "แก้ Reminder")
                .setView(form)
                .setNegativeButton("ยกเลิก", null)
                .setPositiveButton("บันทึก", null)
                .create();

        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            try {
                ReminderSchedule.Recurrence selectedRecurrence = recurrence.getSelectedItemPosition() == 0
                        ? ReminderSchedule.Recurrence.DAILY
                        : ReminderSchedule.Recurrence.WEEKLY;
                int dayOfWeek = day.getSelectedItemPosition() + 1;
                ReminderSchedule saved;
                if (existing == null) {
                    saved = store.add(
                            title.getText().toString(),
                            prompt.getText().toString(),
                            time.getHour(),
                            time.getMinute(),
                            selectedRecurrence,
                            dayOfWeek);
                } else {
                    saved = store.update(
                            existing.id,
                            title.getText().toString(),
                            prompt.getText().toString(),
                            time.getHour(),
                            time.getMinute(),
                            selectedRecurrence,
                            dayOfWeek,
                            existing.enabled);
                }
                ReminderScheduler.schedule(this, saved);
                dialog.dismiss();
                refresh();
            } catch (IllegalArgumentException e) {
                Toast.makeText(this, "ต้องใส่ชื่อและ Prompt", Toast.LENGTH_LONG).show();
            }
        }));
        dialog.show();
    }

    private void toggle(ReminderSchedule reminder) {
        ReminderSchedule updated = store.setEnabled(reminder.id, !reminder.enabled);
        if (updated.enabled) {
            ReminderScheduler.schedule(this, updated);
        } else {
            ReminderScheduler.cancel(this, updated.id);
        }
        refresh();
    }

    private void confirmDelete(ReminderSchedule reminder) {
        new AlertDialog.Builder(this)
                .setTitle("ลบ " + reminder.title + " ?")
                .setMessage("ลบเฉพาะ Reminder นี้")
                .setNegativeButton("ยกเลิก", null)
                .setPositiveButton("ลบ", (dialog, which) -> {
                    ReminderScheduler.cancel(this, reminder.id);
                    store.delete(reminder.id);
                    refresh();
                })
                .show();
    }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        if (bold) view.setTypeface(null, 1);
        return view;
    }

    private Button button(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setAllCaps(false);
        return button;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
