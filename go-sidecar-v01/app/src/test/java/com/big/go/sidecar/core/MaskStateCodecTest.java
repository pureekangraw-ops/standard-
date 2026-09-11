package com.big.go.sidecar.core;

import org.junit.Test;

import java.util.Arrays;

import static org.junit.Assert.assertEquals;

public class MaskStateCodecTest {
    @Test
    public void roundTripsImageIndexAndRectangle() {
        CropSelection mask = CropSelection.fromDrag(10, 20, 80, 90, 100, 100, 1);
        String encoded = MaskStateCodec.encode(2, mask);
        MaskStateCodec.Decoded decoded = MaskStateCodec.decode(encoded);

        assertEquals(2, decoded.imageIndex);
        assertEquals(10, decoded.selection.left);
        assertEquals(20, decoded.selection.top);
        assertEquals(80, decoded.selection.right);
        assertEquals(90, decoded.selection.bottom);
    }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsMalformedState() {
        MaskStateCodec.decode("bad,state");
    }
}
