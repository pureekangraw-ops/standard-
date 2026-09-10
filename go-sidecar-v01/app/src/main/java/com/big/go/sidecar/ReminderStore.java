package com.big.go.sidecar;

import android.content.Context;
import android.content.SharedPreferences;

import com.big.go.sidecar.core.ReminderSchedule;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

public final class ReminderStore {
    private static final String PREFS = "go_sidecar_reminders";
    private static final String KEY_INDEX = "index";
    private final SharedPreferences prefs;

    public ReminderStore(Context context) {
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public List<ReminderSchedule> list() {
        ArrayList<ReminderSchedule> out = new ArrayList<>();
        for (String id : ids()) {
            ReminderSchedule reminder = get(id);
            if (reminder != null) out.add(reminder);
        }
        return Collections.unmodifiableList(out);
    }

    public ReminderSchedule get(String id) {
        if (id == null || id.trim().isEmpty()) return null;
        String cleanId = id.trim();
        String title = prefs.getString(key(cleanId, "title"), null);
        String prompt = prefs.getString(key(cleanId, "prompt"), null);
        String recurrenceRaw = prefs.getString(key(cleanId, "recurrence"), null);
        if (title == null || prompt == null || recurrenceRaw == null) return null;
        try {
            ReminderSchedule.Recurrence recurrence = ReminderSchedule.Recurrence.valueOf(recurrenceRaw);
            int hour = prefs.getInt(key(cleanId, "hour"), 8);
            int minute = prefs.getInt(key(cleanId, "minute"), 0);
            int day = prefs.getInt(key(cleanId, "day"), 1);
            boolean enabled = prefs.getBoolean(key(cleanId, "enabled"), true);
            return new ReminderSchedule(cleanId, title, prompt, hour, minute, recurrence, day, enabled);
        } catch (RuntimeException invalidStoredValue) {
            return null;
        }
    }

    public ReminderSchedule add(
            String title,
            String prompt,
            int hour,
            int minute,
            ReminderSchedule.Recurrence recurrence,
            int dayOfWeek) {
        ReminderSchedule reminder = new ReminderSchedule(
                UUID.randomUUID().toString(), title, prompt, hour, minute, recurrence, dayOfWeek, true);
        ArrayList<String> ids = ids();
        ids.add(reminder.id);
        write(reminder, join(ids));
        return reminder;
    }

    public ReminderSchedule update(
            String id,
            String title,
            String prompt,
            int hour,
            int minute,
            ReminderSchedule.Recurrence recurrence,
            int dayOfWeek,
            boolean enabled) {
        if (!ids().contains(id)) throw new IllegalArgumentException("reminder not found");
        ReminderSchedule reminder = new ReminderSchedule(
                id, title, prompt, hour, minute, recurrence, dayOfWeek, enabled);
        write(reminder, null);
        return reminder;
    }

    public ReminderSchedule setEnabled(String id, boolean enabled) {
        ReminderSchedule current = get(id);
        if (current == null) throw new IllegalArgumentException("reminder not found");
        ReminderSchedule updated = current.withEnabled(enabled);
        write(updated, null);
        return updated;
    }

    public void delete(String id) {
        if (id == null) return;
        ArrayList<String> ids = ids();
        ids.remove(id);
        SharedPreferences.Editor editor = prefs.edit()
                .putString(KEY_INDEX, join(ids));
        String[] fields = {"title", "prompt", "hour", "minute", "recurrence", "day", "enabled"};
        for (String field : fields) editor.remove(key(id, field));
        editor.apply();
    }

    private void write(ReminderSchedule reminder, String indexValue) {
        SharedPreferences.Editor editor = prefs.edit()
                .putString(key(reminder.id, "title"), reminder.title)
                .putString(key(reminder.id, "prompt"), reminder.prompt)
                .putInt(key(reminder.id, "hour"), reminder.hour)
                .putInt(key(reminder.id, "minute"), reminder.minute)
                .putString(key(reminder.id, "recurrence"), reminder.recurrence.name())
                .putInt(key(reminder.id, "day"), reminder.dayOfWeek)
                .putBoolean(key(reminder.id, "enabled"), reminder.enabled);
        if (indexValue != null) editor.putString(KEY_INDEX, indexValue);
        editor.apply();
    }

    private ArrayList<String> ids() {
        ArrayList<String> ids = new ArrayList<>();
        String raw = prefs.getString(KEY_INDEX, "");
        if (raw == null || raw.isEmpty()) return ids;
        for (String id : raw.split(",")) {
            String clean = id.trim();
            if (!clean.isEmpty()) ids.add(clean);
        }
        return ids;
    }

    private static String join(List<String> ids) {
        return String.join(",", ids);
    }

    private static String key(String id, String field) {
        return "reminder." + id + "." + field;
    }
}
