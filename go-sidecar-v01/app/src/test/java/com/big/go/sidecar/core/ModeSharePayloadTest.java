package com.big.go.sidecar.core;

import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class ModeSharePayloadTest {
    @Test
    public void packagesExactRoomPromptWithUserInstruction() {
        ModePromptCatalog.ModePrompt mode = ModePromptCatalog.byId("EVALUATION");

        String payload = ModeSharePayload.format(mode, "เช็กราคานี้ให้หน่อย");

        assertTrue(payload.startsWith(mode.prompt));
        assertTrue(payload.contains("CURRENT REQUEST:\nเช็กราคานี้ให้หน่อย"));
    }

    @Test
    public void omitsEmptyCurrentRequestSection() {
        String payload = ModeSharePayload.format(ModePromptCatalog.byId("GENERAL"), "  ");

        assertFalse(payload.contains("CURRENT REQUEST:"));
    }
}
