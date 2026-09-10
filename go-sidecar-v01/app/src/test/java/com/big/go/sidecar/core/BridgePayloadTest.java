package com.big.go.sidecar.core;

import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class BridgePayloadTest {
    @Test
    public void formatsContextForMainGoWithoutSecretsOrActions() {
        String text = BridgePayload.format(
                "NEED_BIG",
                "ต้องตัดสินใจใหม่",
                "ลูกค้าขอลดราคาและเร่งงาน",
                "ตอบลูกค้าว่าจะขอตรวจสอบก่อน"
        );

        assertTrue(text.contains("GO SIDECAR HANDOFF"));
        assertTrue(text.contains("STATUS: NEED_BIG"));
        assertTrue(text.contains("OBSERVED:"));
        assertTrue(text.contains("REASON:"));
        assertTrue(text.contains("DRAFT:"));
        assertTrue(text.contains("BIG remains final action authority"));
        assertFalse(text.contains("AUTO_SEND"));
    }
}
