package com.big.go.sidecar.core;

public final class GallerySelectionPolicy {
    public static final int MAX_IMAGES = 10;

    private GallerySelectionPolicy() {}

    public static boolean isValidCount(int count) {
        return count >= 1 && count <= MAX_IMAGES;
    }

    public static String shareActionForCount(int count) {
        if (!isValidCount(count)) {
            throw new IllegalArgumentException("image count must be 1-" + MAX_IMAGES);
        }
        return count == 1 ? "SEND" : "SEND_MULTIPLE";
    }
}
