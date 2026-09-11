package com.big.go.sidecar.core;

public final class MaskStateCodec {
    public static final class Decoded {
        public final int imageIndex;
        public final CropSelection selection;

        Decoded(int imageIndex, CropSelection selection) {
            this.imageIndex = imageIndex;
            this.selection = selection;
        }
    }

    private MaskStateCodec() {}

    public static String encode(int imageIndex, CropSelection selection) {
        if (selection == null || !selection.isValid()) throw new IllegalArgumentException("valid selection required");
        return imageIndex + "," + selection.left + "," + selection.top + "," + selection.right + "," + selection.bottom;
    }

    public static Decoded decode(String value) {
        try {
            String[] parts = value.split(",", -1);
            if (parts.length != 5) throw new IllegalArgumentException("malformed mask state");
            int index = Integer.parseInt(parts[0]);
            int left = Integer.parseInt(parts[1]);
            int top = Integer.parseInt(parts[2]);
            int right = Integer.parseInt(parts[3]);
            int bottom = Integer.parseInt(parts[4]);
            CropSelection selection = CropSelection.fromDrag(left, top, right, bottom,
                    Math.max(left, right), Math.max(top, bottom), 1);
            if (index < 0 || !selection.isValid()) throw new IllegalArgumentException("invalid mask state");
            return new Decoded(index, selection);
        } catch (RuntimeException error) {
            if (error instanceof IllegalArgumentException) throw (IllegalArgumentException) error;
            throw new IllegalArgumentException("malformed mask state", error);
        }
    }
}
