package com.big.go.sidecar.core;

public final class CropSelection {
    public final int left;
    public final int top;
    public final int right;
    public final int bottom;
    private final boolean valid;

    private CropSelection(int left, int top, int right, int bottom, boolean valid) {
        this.left = left;
        this.top = top;
        this.right = right;
        this.bottom = bottom;
        this.valid = valid;
    }

    public static CropSelection fromDrag(
            float startX,
            float startY,
            float endX,
            float endY,
            int imageWidth,
            int imageHeight,
            int minimumSize) {
        int left = clamp(Math.round(Math.min(startX, endX)), 0, imageWidth);
        int top = clamp(Math.round(Math.min(startY, endY)), 0, imageHeight);
        int right = clamp(Math.round(Math.max(startX, endX)), 0, imageWidth);
        int bottom = clamp(Math.round(Math.max(startY, endY)), 0, imageHeight);
        boolean valid = right - left >= minimumSize && bottom - top >= minimumSize;
        return new CropSelection(left, top, right, bottom, valid);
    }

    public boolean isValid() {
        return valid;
    }

    public int width() {
        return right - left;
    }

    public int height() {
        return bottom - top;
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }
}
