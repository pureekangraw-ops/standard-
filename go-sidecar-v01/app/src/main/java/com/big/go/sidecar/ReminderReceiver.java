package com.big.go.sidecar;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import com.big.go.sidecar.core.ReminderSchedule;

public final class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ReminderScheduler.ACTION_FIRE.equals(intent.getAction())) return;
        String id = intent.getStringExtra(ReminderScheduler.EXTRA_REMINDER_ID);
        ReminderSchedule reminder = new ReminderStore(context).get(id);
        if (reminder == null || !reminder.enabled) return;

        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm != null) {
            int notificationId = 4000 + Math.floorMod(reminder.id.hashCode(), 5000);
            nm.notify(notificationId, NotificationHelper.reminder(context, reminder));
        }
        ReminderScheduler.schedule(context, reminder);
    }
}
