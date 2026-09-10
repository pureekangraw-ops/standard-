package com.big.go.sidecar.core;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class GallerySelectionPolicyTest {
    @Test
    public void acceptsOneThroughTenImagesOnly() {
        assertFalse(GallerySelectionPolicy.isValidCount(0));
        assertTrue(GallerySelectionPolicy.isValidCount(1));
        assertTrue(GallerySelectionPolicy.isValidCount(10));
        assertFalse(GallerySelectionPolicy.isValidCount(11));
    }

    @Test
    public void oneImageUsesSendAndManyUseSendMultiple() {
        assertEquals("SEND", GallerySelectionPolicy.shareActionForCount(1));
        assertEquals("SEND_MULTIPLE", GallerySelectionPolicy.shareActionForCount(2));
        assertEquals("SEND_MULTIPLE", GallerySelectionPolicy.shareActionForCount(10));
    }
}
