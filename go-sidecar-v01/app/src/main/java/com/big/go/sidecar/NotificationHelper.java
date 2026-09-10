package com.big.go.sidecar;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.big.go.sidecar.core.ReminderSchedule;

final class NotificationHelper {
    static final String CHANNEL_SIDECAR = "go_sidecar";
    static final String CHANNEL_CAPTURE = "go_capture";
    static final String CHANNEL_REMINDER = "go_reminder";

    private NotificationHelper() {}

    static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL_SIDECAR, "GO Sidecar", NotificationManager.IMPORTANCE_LOW));
        nm.createNotificationChannel(new NotificationChannel(CHANNEL_CAPTURE, "GO screen capture", NotificationManager.IMPORTANCE_LOW));
        nm.createNotificationChannel(new NotificationChannel(CHANNEL_REMINDER, "GO reminders", NotificationManager.IMPORTANCE_DEFAULT));
    }

    static Notification sidecar(Context context, boolean bubbleVisible) {
        ensureChannels(context);

        Intent toggle = new Intent(context, BubbleService.class)
                .setAction(BubbleService.ACTION_TOGGLE_BUBBLE);
        PendingIntent togglePi = PendingIntent.getService(
                context,
                11,
                toggle,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Intent stop = new Intent(context, BubbleService.class)
                .setAction(BubbleService.ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(
                context,
                12,
                stop,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        String text = bubbleVisible
                ? "แตะเพื่อซ่อนปุ่ม GO"
                : "แตะเพื่อแสดงปุ่ม GO";

        return new Notification.Builder(context, CHANNEL_SIDECAR)
                .setSmallIcon(android.R.drawable.ic_menu_view)
                .setContentTitle("GO Sidecar พร้อมใช้")
                .setContentText(text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(togglePi)
                .addAction(new Notification.Action.Builder(
                        android.R.drawable.ic_menu_close_clear_cancel,
                        "หยุด Sidecar",
                        stopPi).build())
                .build();
    }

    static Notification capture(Context context) {
        ensureChannels(context);
        return new Notification.Builder(context, CHANNEL_CAPTURE)
                .setSmallIcon(android.R.drawable.ic_menu_camera)
                .setContentTitle("GO Sidecar")
                .setContentText("กำลังจับภาพหน้าจอที่คุณอนุญาต")
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .build();
    }

    static Notification reminder(Context context, ReminderSchedule reminder) {
        ensureChannels(context);
        Intent action = new Intent(context, ReminderActionActivity.class)
                .putExtra(ReminderScheduler.EXTRA_REMINDER_ID, reminder.id);
        PendingIntent actionPi = PendingIntent.getActivity(
                context,
                reminder.id.hashCode(),
                action,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        return new Notification.Builder(context, CHANNEL_REMINDER)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle("GO · " + reminder.title)
                .setContentText("Prompt พร้อมแล้ว · แตะเพื่อคัดลอกและเปิด ChatGPT")
                .setAutoCancel(true)
                .setContentIntent(actionPi)
                .build();
    }
}
