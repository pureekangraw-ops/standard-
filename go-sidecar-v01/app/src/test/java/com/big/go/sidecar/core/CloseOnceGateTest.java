package com.big.go.sidecar.core;

import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class CloseOnceGateTest {
    @Test public void cleanupCanBeginOnlyOnce() {
        CloseOnceGate gate = new CloseOnceGate();
        assertTrue(gate.beginClose());
        assertFalse(gate.beginClose());
    }
}
