package com.big.go.sidecar.core;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

public class BubbleVisibilityPolicyTest {
    @Test public void sidecarStartsWithBubbleHidden() {
        assertFalse(BubbleVisibilityPolicy.initiallyVisible());
    }

    @Test public void notificationTapTogglesBubbleVisibility() {
        assertEquals(true, BubbleVisibilityPolicy.toggle(false));
        assertEquals(false, BubbleVisibilityPolicy.toggle(true));
    }
}
