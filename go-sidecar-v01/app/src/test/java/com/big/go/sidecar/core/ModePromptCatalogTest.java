package com.big.go.sidecar.core;

import org.junit.Test;

import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class ModePromptCatalogTest {
    @Test
    public void exposesSixMainModesWithLoadRouteRuleContract() {
        List<ModePromptCatalog.ModePrompt> modes = ModePromptCatalog.all();

        assertEquals(6, modes.size());
        assertEquals("GENERAL", modes.get(0).id);
        assertEquals("ADVISOR", modes.get(1).id);
        assertEquals("PROJECT", modes.get(2).id);
        assertEquals("MONEY", modes.get(3).id);
        assertEquals("BUSINESS", modes.get(4).id);
        assertEquals("RESEARCH", modes.get(5).id);

        for (ModePromptCatalog.ModePrompt mode : modes) {
            assertTrue(mode.prompt.contains("LOAD:"));
            assertTrue(mode.prompt.contains("ROUTE:"));
            assertTrue(mode.prompt.contains("RULE:"));
            assertFalse(mode.prompt.contains("FOCUS:"));
        }
    }

    @Test
    public void preservesApprovedModeIntent() {
        assertTrue(ModePromptCatalog.byId("GENERAL").prompt.contains("บิ๊กคุยก็คุย แต่ใช่ว่าจะห้ามทำงาน"));
        assertTrue(ModePromptCatalog.byId("ADVISOR").prompt.contains("แนะนำตรงไปตรงมา"));
        assertTrue(ModePromptCatalog.byId("PROJECT").prompt.contains("ดูที่งาน อ่านที่บิ๊กพิมพ์ แล้วทำให้ตรง"));
        assertTrue(ModePromptCatalog.byId("MONEY").prompt.contains("เตือนก่อนบาน จัดก่อนเจ็บตัว"));
        assertTrue(ModePromptCatalog.byId("BUSINESS").prompt.contains("เพื่อนคู่คิด มิตรคู่งาน"));
        assertTrue(ModePromptCatalog.byId("RESEARCH").prompt.contains("ดูความจริง อย่าดูความลวง"));
    }
}
