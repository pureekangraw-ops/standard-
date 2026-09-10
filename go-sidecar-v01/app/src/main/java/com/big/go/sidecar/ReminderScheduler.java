package com.big.go.sidecar;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;

import com.big.go.sidecar.core.ReminderSchedule;

import java.time.ZoneId;

public final class ReminderScheduler {
    private static final long WINDOW_MILLIS = 10L * 60L * 1000L;
    static final String ACTION_FIRE = "com.big.go.sidecar.REMINDER_FIRE";
    static final String EXTRA_REMINDER_ID = "reminder_id";

    private ReminderScheduler() {}

    public static void schedule(Context context, ReminderSchedule reminder) {
        cancel(context, reminder.id);
        if (!reminder.enabled) return;
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        long triggerAt = reminder.nextTriggerMillis(
                System.currentTimeMillis(), ZoneId.systemDefault());
        alarms.setWindow(
                AlarmManager.RTC_WAKEUP,
                triggerAt,
                WINDOW_MILLIS,
                pendingIntent(context, reminder.id));
    }

    public static void cancel(Context context, String reminderId) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms != null) alarms.cancel(pendingIntent(context, reminderId));
    }

    public static void rescheduleAll(Context context) {
        for (ReminderSchedule reminder : new ReminderStore(context).list()) {
            if (reminder.enabled) schedule(context, reminder);
        }
    }

    private static PendingIntent pendingIntent(Context context, String reminderId) {
        Intent intent = new Intent(context, ReminderReceiver.class)
                .setAction(ACTION_FIRE)
                .putExtra(EXTRA_REMINDER_ID, reminderId);
        return PendingIntent.getBroadcast(
                context,
                reminderId.hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
