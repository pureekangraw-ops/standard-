package com.big.go.sidecar.core;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class AppDisplayNameTest {
    @Test
    public void showsTheExactInstalledBuildVersion() {
        assertEquals("GO Sidecar v0.1.7-dev", AppDisplayName.forVersion("0.1.7-dev"));
    }

    @Test
    public void fallsBackWhenVersionIsBlank() {
        assertEquals("GO Sidecar", AppDisplayName.forVersion("  "));
    }
}
