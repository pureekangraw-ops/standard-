package com.big.go.sidecar.core;

import org.junit.Test;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.ZoneId;

import static org.junit.Assert.assertEquals;

public class ReminderScheduleTest {
    private static final ZoneId UTC = ZoneId.of("UTC");

    @Test
    public void dailyReminderUsesTodayWhenTimeIsStillAhead() {
        ReminderSchedule reminder = daily(20, 0);
        long now = Instant.parse("2026-09-10T08:00:00Z").toEpochMilli();
        assertEquals(Instant.parse("2026-09-10T20:00:00Z").toEpochMilli(), reminder.nextTriggerMillis(now, UTC));
    }

    @Test
    public void dailyReminderRollsToTomorrowAfterTimePasses() {
        ReminderSchedule reminder = daily(20, 0);
        long now = Instant.parse("2026-09-10T21:15:00Z").toEpochMilli();
        assertEquals(Instant.parse("2026-09-11T20:00:00Z").toEpochMilli(), reminder.nextTriggerMillis(now, UTC));
    }

    @Test
    public void weeklyReminderUsesSelectedWeekday() {
        ReminderSchedule reminder = weekly(DayOfWeek.FRIDAY, 9, 30);
        long now = Instant.parse("2026-09-10T12:00:00Z").toEpochMilli();
        assertEquals(Instant.parse("2026-09-11T09:30:00Z").toEpochMilli(), reminder.nextTriggerMillis(now, UTC));
    }

    @Test
    public void weeklyReminderRollsOneWeekWhenTodaysTimePassed() {
        ReminderSchedule reminder = weekly(DayOfWeek.THURSDAY, 9, 30);
        long now = Instant.parse("2026-09-10T12:00:00Z").toEpochMilli();
        assertEquals(Instant.parse("2026-09-17T09:30:00Z").toEpochMilli(), reminder.nextTriggerMillis(now, UTC));
    }

    private ReminderSchedule daily(int hour, int minute) {
        return new ReminderSchedule("id", "เช็กงาน", "LOAD GENERAL MODE", hour, minute,
                ReminderSchedule.Recurrence.DAILY, DayOfWeek.MONDAY.getValue(), true);
    }

    private ReminderSchedule weekly(DayOfWeek day, int hour, int minute) {
        return new ReminderSchedule("id", "เช็กงาน", "LOAD GENERAL MODE", hour, minute,
                ReminderSchedule.Recurrence.WEEKLY, day.getValue(), true);
    }
}
