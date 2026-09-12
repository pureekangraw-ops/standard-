package com.big.go.sidecar.core;

import org.junit.Test;

import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class PracticalLensCatalogTest {
    @Test
    public void exposesSevenLifeAndWorkCommandsInPriorityOrder() {
        List<PracticalLensCatalog.PracticalLens> lenses = PracticalLensCatalog.all();

        assertEquals(7, lenses.size());
        assertLens(lenses.get(0), "CHOOSE_PATH", "🧭 เลือกทาง");
        assertLens(lenses.get(1), "LIVE_SITUATION", "⚡ ดูสถานการณ์ตอนนี้");
        assertLens(lenses.get(2), "ROOT_CAUSE", "🕵️ หาต้นเหตุ");
        assertLens(lenses.get(3), "PERFORMANCE_FIX", "🚀 หาจุดแก้ที่คุ้มสุด");
        assertLens(lenses.get(4), "COMPARE_SCENARIOS", "🔮 เทียบสถานการณ์");
        assertLens(lenses.get(5), "ORGANIZE_REALITY", "🧹 จัดของที่กระจาย");
        assertLens(lenses.get(6), "DESIGN_WORKFLOW", "🛠️ ออกแบบทางทำงาน");
    }

    @Test
    public void everyCommandPreservesRealityAndAuthorityBoundaries() {
        for (PracticalLensCatalog.PracticalLens lens : PracticalLensCatalog.all()) {
            assertTrue(lens.prompt.contains("FACT / INFERENCE / UNKNOWN / CONFLICT"));
            assertTrue(lens.prompt.contains("Lens มีหน้าที่ช่วยมอง ไม่ใช่เปลี่ยนเจตนาหรือตัดสินใจแทน"));
            assertTrue(lens.prompt.contains("DO"));
            assertTrue(lens.prompt.contains("GUIDE"));
            assertTrue(lens.prompt.contains("BRAKE"));
            assertTrue(lens.prompt.contains("OUTPUT"));
        }
    }

    @Test
    public void commandsKeepTheirDistinctWorkingQuestions() {
        assertTrue(PracticalLensCatalog.byId("CHOOSE_PATH").prompt.contains("ควรเลือกทางไหน"));
        assertTrue(PracticalLensCatalog.byId("LIVE_SITUATION").prompt.contains("ณ ตอนนี้"));
        assertTrue(PracticalLensCatalog.byId("ROOT_CAUSE").prompt.contains("เกิดจากอะไรจริง"));
        assertTrue(PracticalLensCatalog.byId("PERFORMANCE_FIX").prompt.contains("คอขวด"));
        assertTrue(PracticalLensCatalog.byId("COMPARE_SCENARIOS").prompt.contains("จำลองผล"));
        assertTrue(PracticalLensCatalog.byId("ORGANIZE_REALITY").prompt.contains("Source of Truth"));
        assertTrue(PracticalLensCatalog.byId("DESIGN_WORKFLOW").prompt.contains("ตั้งแต่เริ่มจนจบ"));
    }

    private static void assertLens(PracticalLensCatalog.PracticalLens lens, String id, String label) {
        assertEquals(id, lens.id);
        assertEquals(label, lens.label);
        assertTrue(lens.prompt.startsWith("GO PRACTICAL LENS"));
    }
}
