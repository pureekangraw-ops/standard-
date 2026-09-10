package com.big.go.sidecar.core;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class FavoritePromptTest {
    @Test
    public void trimsOuterWhitespaceButKeepsPromptMeaning() {
        FavoritePrompt favorite = new FavoritePrompt(" id-1 ", " การเงิน ", "  LOAD MONEY MODE\nROUTE FINANCE CURRENT  ");
        assertEquals("id-1", favorite.id);
        assertEquals("การเงิน", favorite.name);
        assertEquals("LOAD MONEY MODE\nROUTE FINANCE CURRENT", favorite.prompt);
    }

    @Test
    public void rejectsBlankRequiredFields() {
        assertRejected("", "ชื่อ", "prompt");
        assertRejected("id", "   ", "prompt");
        assertRejected("id", "ชื่อ", "   ");
    }

    private void assertRejected(String id, String name, String prompt) {
        try {
            new FavoritePrompt(id, name, prompt);
            fail("expected IllegalArgumentException");
        } catch (IllegalArgumentException expected) {
            assertTrue(expected.getMessage().contains("required"));
        }
    }
}
