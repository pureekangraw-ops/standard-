package com.big.go.sidecar.core;

import org.junit.Test;

import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class ModePromptCatalogTest {
    @Test
    public void exposesFiveApprovedCityGatesInSidebarOrder() {
        List<ModePromptCatalog.ModePrompt> modes = ModePromptCatalog.all();

        assertEquals(5, modes.size());
        assertMode(modes.get(0), "GENERAL", "🧠 คุยกัน", "LOAD: GENERAL MODE");
        assertMode(modes.get(1), "EVALUATION", "🧭 ประเมิน", "LOAD: EVALUATION MODE");
        assertMode(modes.get(2), "PRODUCTION", "🛠️ ออกแบบและผลิต", "LOAD: PRODUCTION MODE");
        assertMode(modes.get(3), "MONEY", "💰 จัดการเงิน", "LOAD: MONEY MODE");
        assertMode(modes.get(4), "BUSINESS", "🤝 ทำมาหากิน", "LOAD: BUSINESS MODE");
    }

    @Test
    public void everyCityGateCarriesOneRoomOneModeContract() {
        for (ModePromptCatalog.ModePrompt mode : ModePromptCatalog.all()) {
            assertTrue(mode.prompt.contains("ROOM LOCK:"));
            assertTrue(mode.prompt.contains("- 1 ROOM = 1 MODE"));
            assertTrue(mode.prompt.contains("ROUTE:"));
            assertTrue(mode.prompt.contains("RULE:"));
            assertFalse(mode.prompt.contains("FOCUS:"));
            assertFalse(mode.prompt.contains("LOAD: ADVISOR MODE"));
            assertFalse(mode.prompt.contains("LOAD: RESEARCH MODE"));
            assertFalse(mode.prompt.contains("LOAD: PROJECT MODE"));
        }
    }

    @Test
    public void evaluationCombinesResearchAndAdviceWithoutModeSwitching() {
        String prompt = ModePromptCatalog.byId("EVALUATION").prompt;

        assertTrue(prompt.contains("การค้นความจริงและการช่วยตัดสินใจทำอยู่ในห้องเดียวกัน"));
        assertTrue(prompt.contains("แยก FACT / INTERPRETATION / ASSUMPTION"));
        assertTrue(prompt.contains("เปรียบเทียบทางเลือกพร้อมสิ่งที่ได้ สิ่งที่เสีย ความเสี่ยง และผลกระทบสำคัญ"));
        assertTrue(prompt.contains("แนะนำตรงไปตรงมา"));
        assertTrue(prompt.contains("หลักฐานไม่พอ = UNKNOWN / VERIFY"));
    }

    @Test
    public void productionAndBusinessKeepBoundedHandoffBoundary() {
        String production = ModePromptCatalog.byId("PRODUCTION").prompt;
        String business = ModePromptCatalog.byId("BUSINESS").prompt;

        assertTrue(production.contains("ถ้ารับ HANDOFF มาจากห้องอื่น ให้ใช้ handoff เป็น Scope Input แต่ไม่เปลี่ยนตัวเองเป็นโหมดต้นทาง"));
        assertTrue(production.contains("ตรวจของจริงก่อนบอกว่า PASS / DONE"));
        assertTrue(business.contains("สร้าง HANDOFF ไป PRODUCTION แทนการผสมสองโหมดในห้องเดียว"));
        assertTrue(business.contains("Requested Result / Client Need / Scope / Deliverables / Constraints / Deadline / Sources / Authority / RETURN POINT"));
    }

    @Test
    public void legacySplitModesAreNoLongerAddressable() {
        assertUnknown("ADVISOR");
        assertUnknown("RESEARCH");
        assertUnknown("PROJECT");
    }

    private static void assertMode(ModePromptCatalog.ModePrompt mode, String id, String label, String loadLine) {
        assertEquals(id, mode.id);
        assertEquals(label, mode.label);
        assertTrue(mode.prompt.startsWith(loadLine));
    }

    private static void assertUnknown(String id) {
        try {
            ModePromptCatalog.byId(id);
            fail("Expected legacy mode to be removed: " + id);
        } catch (IllegalArgumentException expected) {
            assertTrue(expected.getMessage().contains(id));
        }
    }
}
