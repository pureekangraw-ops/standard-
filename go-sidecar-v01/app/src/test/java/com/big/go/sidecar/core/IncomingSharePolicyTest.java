package com.big.go.sidecar.core;

import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class IncomingSharePolicyTest {
    @Test
    public void acceptsOneToTenImages() {
        assertTrue(IncomingSharePolicy.isSupported("android.intent.action.SEND", "image/png", 1));
        assertTrue(IncomingSharePolicy.isSupported("android.intent.action.SEND_MULTIPLE", "image/*", 10));
    }

    @Test
    public void rejectsTextEmptyAndOversizedShares() {
        assertFalse(IncomingSharePolicy.isSupported("android.intent.action.SEND", "text/plain", 1));
        assertFalse(IncomingSharePolicy.isSupported("android.intent.action.SEND", "image/png", 0));
        assertFalse(IncomingSharePolicy.isSupported("android.intent.action.SEND_MULTIPLE", "image/png", 11));
    }

    @Test
    public void keepsUniqueNonBlankUrisWithinLimit() {
        assertEquals(
                Arrays.asList("content://one", "content://two"),
                IncomingSharePolicy.uniqueUris(Arrays.asList("content://one", "", "content://one", "content://two")));
        assertEquals(Collections.emptyList(), IncomingSharePolicy.uniqueUris(null));
    }
}
