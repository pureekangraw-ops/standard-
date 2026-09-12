package com.big.go.sidecar.core;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class BubbleActionRouterTest {
    @Test
    public void tapOpensTheGoMenu() {
        assertEquals(BubbleActionRouter.Target.OPEN_MENU,
                BubbleActionRouter.route(BubbleGesturePolicy.Action.TAP));
    }

    @Test
    public void longPressKeepsQuickScreenAskAvailable() {
        assertEquals(BubbleActionRouter.Target.ASK_GO,
                BubbleActionRouter.route(BubbleGesturePolicy.Action.LONG_PRESS));
    }

    @Test
    public void dragDoesNotLaunchAnAction() {
        assertEquals(BubbleActionRouter.Target.NONE,
                BubbleActionRouter.route(BubbleGesturePolicy.Action.DRAG));
    }
}
