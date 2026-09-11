package com.big.go.sidecar.core;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class ImageImportPolicyTest {
    @Test
    public void onlyAcceptsContentUrisAndBoundedImages() {
        assertTrue(ImageImportPolicy.isSupportedUri("content://screenshots/1"));
        assertFalse(ImageImportPolicy.isSupportedUri("file:///private/screen.png"));
        assertTrue(ImageImportPolicy.isSafeDimensions(1080, 2400));
        assertFalse(ImageImportPolicy.isSafeDimensions(100_000, 100_000));
        assertFalse(ImageImportPolicy.isSafeDimensions(0, 100));
    }

    @Test
    public void calculatesPowerOfTwoPreviewSampling() {
        assertEquals(1, ImageImportPolicy.sampleSize(1080, 2400));
        assertEquals(2, ImageImportPolicy.sampleSize(4000, 3000));
        assertEquals(4, ImageImportPolicy.sampleSize(8000, 6000));
    }
}
