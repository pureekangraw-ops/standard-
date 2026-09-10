package com.big.go.sidecar.core;

public final class BubbleVisibilityPolicy {
    private BubbleVisibilityPolicy() {}

    public static boolean initiallyVisible() {
        return false;
    }

    public static boolean toggle(boolean visible) {
        return !visible;
    }
}
