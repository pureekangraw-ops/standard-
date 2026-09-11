package com.big.go.sidecar.core;

public final class ImageImportPolicy {
    public static final long MAX_PIXELS = 50_000_000L;
    public static final int MAX_PREVIEW_EDGE = 2560;

    private ImageImportPolicy() {}

    public static boolean isSupportedUri(String value) {
        return value != null && value.startsWith("content://");
    }

    public static boolean isSafeDimensions(int width, int height) {
        return width > 0 && height > 0 && (long) width * (long) height <= MAX_PIXELS;
    }

    public static int sampleSize(int width, int height) {
        int sample = 1;
        while (Math.max(width / sample, height / sample) > MAX_PREVIEW_EDGE) sample *= 2;
        return sample;
    }
}
