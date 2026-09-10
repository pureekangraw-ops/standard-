package com.big.go.sidecar.core;

public final class BubbleGesturePolicy {
    public enum Action {
        TAP,
        LONG_PRESS,
        DRAG
    }

    private BubbleGesturePolicy() {}

    public static Action classify(long durationMs, float distancePx, float dragThresholdPx, long longPressMs) {
        if (distancePx >= dragThresholdPx) return Action.DRAG;
        if (durationMs >= longPressMs) return Action.LONG_PRESS;
        return Action.TAP;
    }
}
