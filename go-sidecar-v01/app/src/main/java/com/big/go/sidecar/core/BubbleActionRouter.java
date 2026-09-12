package com.big.go.sidecar.core;

public final class BubbleActionRouter {
    public enum Target {
        OPEN_MENU,
        ASK_GO,
        NONE
    }

    private BubbleActionRouter() {}

    public static Target route(BubbleGesturePolicy.Action gesture) {
        if (gesture == BubbleGesturePolicy.Action.TAP) return Target.OPEN_MENU;
        if (gesture == BubbleGesturePolicy.Action.LONG_PRESS) return Target.ASK_GO;
        return Target.NONE;
    }
}
