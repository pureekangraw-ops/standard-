package com.big.go.sidecar.core;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;

public final class ReminderSchedule {
    public enum Recurrence {
        DAILY,
        WEEKLY
    }

    public final String id;
    public final String title;
    public final String prompt;
    public final int hour;
    public final int minute;
    public final Recurrence recurrence;
    public final int dayOfWeek;
    public final boolean enabled;

    public ReminderSchedule(
            String id,
            String title,
            String prompt,
            int hour,
            int minute,
            Recurrence recurrence,
            int dayOfWeek,
            boolean enabled) {
        this.id = required(id);
        this.title = required(title);
        this.prompt = required(prompt);
        if (hour < 0 || hour > 23) throw new IllegalArgumentException("hour must be 0-23");
        if (minute < 0 || minute > 59) throw new IllegalArgumentException("minute must be 0-59");
        if (recurrence == null) throw new IllegalArgumentException("recurrence is required");
        if (dayOfWeek < 1 || dayOfWeek > 7) throw new IllegalArgumentException("dayOfWeek must be 1-7");
        this.hour = hour;
        this.minute = minute;
        this.recurrence = recurrence;
        this.dayOfWeek = dayOfWeek;
        this.enabled = enabled;
    }

    public long nextTriggerMillis(long nowMillis, ZoneId zone) {
        if (zone == null) throw new IllegalArgumentException("zone is required");
        ZonedDateTime now = Instant.ofEpochMilli(nowMillis).atZone(zone);
        ZonedDateTime candidate = now
                .withHour(hour)
                .withMinute(minute)
                .withSecond(0)
                .withNano(0);

        if (recurrence == Recurrence.DAILY) {
            if (!candidate.isAfter(now)) candidate = candidate.plusDays(1);
            return candidate.toInstant().toEpochMilli();
        }

        int today = candidate.getDayOfWeek().getValue();
        int daysAhead = Math.floorMod(dayOfWeek - today, 7);
        candidate = candidate.plusDays(daysAhead);
        if (!candidate.isAfter(now)) candidate = candidate.plusWeeks(1);
        return candidate.toInstant().toEpochMilli();
    }

    public ReminderSchedule withEnabled(boolean newEnabled) {
        return new ReminderSchedule(id, title, prompt, hour, minute, recurrence, dayOfWeek, newEnabled);
    }

    public DayOfWeek selectedDay() {
        return DayOfWeek.of(dayOfWeek);
    }

    private static String required(String value) {
        String clean = value == null ? "" : value.trim();
        if (clean.isEmpty()) throw new IllegalArgumentException("required field is blank");
        return clean;
    }
}
