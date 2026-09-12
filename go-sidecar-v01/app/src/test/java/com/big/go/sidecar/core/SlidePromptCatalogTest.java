package com.big.go.sidecar.core;

import org.junit.Test;

import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class SlidePromptCatalogTest {
    @Test
    public void exposesSeparateCreateAndPatchCommands() {
        List<SlidePromptCatalog.SlidePrompt> prompts = SlidePromptCatalog.all();

        assertEquals(2, prompts.size());
        assertPrompt(prompts.get(0), "CREATE_NEW_SLIDE", "✨ สร้างสไลด์ใหม่");
        assertPrompt(prompts.get(1), "PATCH_APPROVED_SLIDE", "🩹 แก้สไลด์ที่ผ่านแล้ว");
    }

    @Test
    public void bothCommandsEnforceSingleIndependentSlideOutput() {
        for (SlidePromptCatalog.SlidePrompt prompt : SlidePromptCatalog.all()) {
            assertTrue(prompt.prompt.contains("1 generation = 1 slide = 1 independent image"));
            assertTrue(prompt.prompt.contains("Exactly one independent presentation slide image"));
            assertTrue(prompt.prompt.contains("No collage / no triptych / no contact sheet / no multi-slide canvas"));
        }
    }

    @Test
    public void createUsesMasterAsVisualDnaOnly() {
        String prompt = SlidePromptCatalog.byId("CREATE_NEW_SLIDE").prompt;

        assertTrue(prompt.contains("MODE: CREATE_NEW_SLIDE"));
        assertTrue(prompt.contains("MASTER_REFERENCE controls Visual DNA only"));
        assertTrue(prompt.contains("never omit, shorten, or alter required CONTENT_SOURCE"));
        assertTrue(prompt.contains("CREATIVE FREEDOM — ONLY"));
        assertFalse(prompt.contains("MODE: PATCH_APPROVED_SLIDE"));
    }

    @Test
    public void patchAllowsExactlyOneDeltaFromApprovedBase() {
        String prompt = SlidePromptCatalog.byId("PATCH_APPROVED_SLIDE").prompt;

        assertTrue(prompt.contains("MODE: PATCH_APPROVED_SLIDE"));
        assertTrue(prompt.contains("CREATIVE FREEDOM: NONE"));
        assertTrue(prompt.contains("exactly one Delta"));
        assertTrue(prompt.contains("Never use a rejected or drifted output as the new baseline"));
        assertTrue(prompt.contains("BASE_SLIDE controls the exact existing content and wording"));
        assertTrue(prompt.contains("If the latest approved BASE_SLIDE is not attached or its approval is ambiguous, stop and request it"));
        assertFalse(prompt.contains("CONTENT_SOURCE"));
        assertTrue(prompt.contains("CHANGE ONLY"));
        assertFalse(prompt.contains("MODE: CREATE_NEW_SLIDE"));
    }

    private static void assertPrompt(SlidePromptCatalog.SlidePrompt prompt, String id, String label) {
        assertEquals(id, prompt.id);
        assertEquals(label, prompt.label);
        assertTrue(prompt.prompt.startsWith("NO-DRIFT SLIDE PRODUCTION MODE"));
    }
}
