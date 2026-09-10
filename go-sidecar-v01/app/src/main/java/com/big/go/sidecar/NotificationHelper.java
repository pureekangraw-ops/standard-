package com.big.go.sidecar;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

final class NotificationHelper {
    static final String CHANNEL_SIDECAR = "go_sidecar";
    static final String CHANNEL_CAPTURE = "go_capture";

    private NotificationHelper() {}

    static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL_SIDECAR, "GO Sidecar", NotificationManager.IMPORTANCE_LOW));
        nm.createNotificationChannel(new NotificationChannel(CHANNEL_CAPTURE, "GO screen capture", NotificationManager.IMPORTANCE_LOW));
    }

    static Notification sidecar(Context context, String text) {
        ensureChannels(context);
        Intent open = new Intent(context, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(context, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(context, CHANNEL_SIDECAR)
                .setSmallIcon(android.R.drawable.ic_menu_view)
                .setContentTitle("GO Sidecar ทำงานอยู่")
                .setContentText(text)
                .setOngoing(true)
                .setContentIntent(pi)
                .build();
    }

    static Notification capture(Context context) {
        ensureChannels(context);
        return new Notification.Builder(context, CHANNEL_CAPTURE)
                .setSmallIcon(android.R.drawable.ic_menu_camera)
                .setContentTitle("GO Sidecar")
                .setContentText("กำลังจับภาพหน้าจอที่คุณอนุญาต")
                .setOngoing(true)
                .build();
    }
}
