package com.big.go.sidecar.core;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class CropSelectionTest {
    @Test
    public void normalizesReverseDragAndClampsToImageBounds() {
        CropSelection selection = CropSelection.fromDrag(
                900f, 700f,
                -20f, 100f,
                800, 600,
                24);

        assertTrue(selection.isValid());
        assertEquals(0, selection.left);
        assertEquals(100, selection.top);
        assertEquals(800, selection.right);
        assertEquals(600, selection.bottom);
        assertEquals(800, selection.width());
        assertEquals(500, selection.height());
    }

    @Test
    public void rejectsSelectionSmallerThanMinimumSize() {
        CropSelection selection = CropSelection.fromDrag(
                100f, 100f,
                110f, 118f,
                800, 600,
                24);

        assertFalse(selection.isValid());
    }
}
