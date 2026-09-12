package com.big.go.sidecar.core;

import org.junit.Test;

import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class PracticalLensCatalogTest {
    @Test
    public void exposesSixLifeAndWorkButtonsInApprovedOrder() {
        List<PracticalLensCatalog.PracticalLens> lenses = PracticalLensCatalog.all();

        assertEquals(6, lenses.size());
        assertLens(lenses.get(0), "CHAT_WITH_GO", "💬 เม้ามอยกับ GO");
        assertLens(lenses.get(1), "FIND_INCOME", "💸 คิดทางหาเงิน");
        assertLens(lenses.get(2), "MONEY_PRIORITY", "💰 จัดเงินยังไงดี");
        assertLens(lenses.get(3), "VERIFY_AND_GUIDE", "🧭 เช็กแล้วชี้ทาง");
        assertLens(lenses.get(4), "ROOT_CAUSE_FIX", "🔧 พังตรงไหน แก้ยังไง");
        assertLens(lenses.get(5), "ORGANIZE_AND_NEXT", "🧹 สรุปแล้ววางทางต่อ");
    }

    @Test
    public void everyButtonPreservesRealityAuthorityAndCategoryBoundaries() {
        for (PracticalLensCatalog.PracticalLens lens : PracticalLensCatalog.all()) {
            assertTrue(lens.prompt.contains("FACT / INFERENCE / UNKNOWN / CONFLICT"));
            assertTrue(lens.prompt.contains("ข้อความล่าสุด"));
            assertTrue(lens.prompt.contains("DO"));
            assertTrue(lens.prompt.contains("GUIDE"));
            assertTrue(lens.prompt.contains("BRAKE"));
            assertTrue(lens.prompt.contains("OUTPUT"));
            assertFalse(lens.prompt.contains("ผลิตสไลด์"));
            assertFalse(lens.prompt.contains("Notion"));
        }
    }

    @Test
    public void eachButtonKeepsItsApprovedWorkingBoundary() {
        String chat = PracticalLensCatalog.byId("CHAT_WITH_GO").prompt;
        assertTrue(chat.contains("คุยและช่วยคิดตามเรื่องที่บิ๊กเล่า"));
        assertTrue(chat.contains("ไม่รีบสอน"));
        assertTrue(chat.contains("ไม่รีบวิเคราะห์หนัก"));
        assertTrue(chat.contains("ไม่ผลักเรื่องไปเป็นแผน"));

        String income = PracticalLensCatalog.byId("FIND_INCOME").prompt;
        assertTrue(income.contains("ความสามารถ"));
        assertTrue(income.contains("เวลา"));
        assertTrue(income.contains("ทรัพยากร"));
        assertTrue(income.contains("ข้อจำกัดจริง"));

        String money = PracticalLensCatalog.byId("MONEY_PRIORITY").prompt;
        assertTrue(money.contains("เงินที่มี"));
        assertTrue(money.contains("หนี้"));
        assertTrue(money.contains("รายจ่าย"));
        assertTrue(money.contains("เส้นตาย"));
        assertTrue(money.contains("ห้ามสร้างยอด"));

        String guide = PracticalLensCatalog.byId("VERIFY_AND_GUIDE").prompt;
        assertTrue(guide.contains("ข้อมูลปัจจุบัน"));
        assertTrue(guide.contains("หลักฐาน"));
        assertTrue(guide.contains("VERIFY"));

        String fix = PracticalLensCatalog.byId("ROOT_CAUSE_FIX").prompt;
        assertTrue(fix.contains("ต้นเหตุ"));
        assertTrue(fix.contains("วัดผล"));
        assertTrue(fix.contains("Stop Rule"));

        String organize = PracticalLensCatalog.byId("ORGANIZE_AND_NEXT").prompt;
        assertTrue(organize.contains("Current"));
        assertTrue(organize.contains("ขั้นต่อไป"));
        assertTrue(organize.contains("เฉพาะเมื่อจำเป็น"));
    }

    @Test
    public void removesAllSevenLegacyLifeAndWorkCommands() {
        String[] legacyIds = {
                "CHOOSE_PATH",
                "LIVE_SITUATION",
                "ROOT_CAUSE",
                "PERFORMANCE_FIX",
                "COMPARE_SCENARIOS",
                "ORGANIZE_REALITY",
                "DESIGN_WORKFLOW"
        };

        for (String legacyId : legacyIds) {
            try {
                PracticalLensCatalog.byId(legacyId);
                fail("Legacy practical lens must be removed: " + legacyId);
            } catch (IllegalArgumentException expected) {
                assertTrue(expected.getMessage().contains(legacyId));
            }
        }
    }

    private static void assertLens(PracticalLensCatalog.PracticalLens lens, String id, String label) {
        assertEquals(id, lens.id);
        assertEquals(label, lens.label);
        assertTrue(lens.prompt.startsWith("GO PRACTICAL LENS"));
    }
}
