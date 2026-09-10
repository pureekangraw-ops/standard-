package com.big.go.sidecar.core;

import org.junit.Test;
import static org.junit.Assert.assertTrue;

public class GoPromptTest {
    @Test public void promptPreservesAuthorityAndSensitiveGate() {
        String p = GoPrompt.build("ช่วยตอบ");
        assertTrue(p.contains("BIG เป็นคนกดส่งเอง"));
        assertTrue(p.contains("NEED_BIG"));
        assertTrue(p.contains("UNKNOWN"));
        assertTrue(p.contains("Password"));
        assertTrue(p.contains("ช่วยตอบ"));
    }
}
