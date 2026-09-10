package com.big.go.sidecar.core;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class ClipboardAssistantPolicyTest {
    private static final String SOURCE = "ลูกค้าบอกว่า ขอเลื่อนไปพรุ่งนี้ 10 โมง";

    @Test
    public void sendKeepsClipboardTextUnchanged() {
        assertEquals(SOURCE,
                ClipboardAssistantPolicy.packageText(ClipboardAssistantPolicy.Action.SEND, SOURCE));
    }

    @Test
    public void helperActionsPreserveSourceAndAddTheirOwnInstruction() {
        assertPackaged(ClipboardAssistantPolicy.Action.SUMMARIZE, "สรุป");
        assertPackaged(ClipboardAssistantPolicy.Action.DRAFT_REPLY, "ร่างคำตอบ");
        assertPackaged(ClipboardAssistantPolicy.Action.CHECK, "ตรวจ");
        assertPackaged(ClipboardAssistantPolicy.Action.TRANSLATE, "แปล");
    }

    @Test
    public void blankClipboardIsRejected() {
        try {
            ClipboardAssistantPolicy.packageText(ClipboardAssistantPolicy.Action.SEND, "   ");
            fail("expected IllegalArgumentException");
        } catch (IllegalArgumentException expected) {
            assertTrue(expected.getMessage().contains("clipboard"));
        }
    }

    private void assertPackaged(ClipboardAssistantPolicy.Action action, String keyword) {
        String packaged = ClipboardAssistantPolicy.packageText(action, SOURCE);
        assertTrue(packaged.contains(keyword));
        assertTrue(packaged.endsWith(SOURCE));
    }
}
