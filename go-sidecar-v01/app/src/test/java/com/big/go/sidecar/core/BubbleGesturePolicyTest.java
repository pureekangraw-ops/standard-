package com.big.go.sidecar.core;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class BubbleGesturePolicyTest {
    @Test
    public void shortStationaryTouchIsTap() {
        assertEquals(BubbleGesturePolicy.Action.TAP,
                BubbleGesturePolicy.classify(220, 4f, 10f, 650));
    }

    @Test
    public void longStationaryTouchOpensModes() {
        assertEquals(BubbleGesturePolicy.Action.LONG_PRESS,
                BubbleGesturePolicy.classify(820, 3f, 10f, 650));
    }

    @Test
    public void movedTouchIsDragEvenWhenHeldLong() {
        assertEquals(BubbleGesturePolicy.Action.DRAG,
                BubbleGesturePolicy.classify(900, 18f, 10f, 650));
    }
}
