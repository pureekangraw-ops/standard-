package com.big.go.sidecar.core;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

public final class SlidePromptCatalog {
    public static final class SlidePrompt {
        public final String id;
        public final String label;
        public final String prompt;

        public SlidePrompt(String id, String label, String prompt) {
            this.id = id;
            this.label = label;
            this.prompt = prompt;
        }
    }

    private static final String GLOBAL_RULES = """

            ROLE
            Produce the requested presentation slide precisely.
            Do not redesign, reinterpret, improve the whole slide, or create a new visual direction unless explicitly authorized.

            GLOBAL RULES
            - 1 generation = 1 slide = 1 independent image.
            - Output one complete 16:9 presentation slide.
            - No collage / no triptych / no contact sheet / no multi-slide canvas.
            - Do not put multiple options in one image.
            - Whitespace over filler. Preservation over redesign.

            AUTHORITY RULE
            Change only what is explicitly allowed under CREATIVE FREEDOM or CHANGE ONLY.
            Everything else is LOCKED.
            Do not rebalance, harmonize, remaster, compensate elsewhere, or spread a color/style change to unrelated elements.
            If forced to choose, prefer a small incomplete optional detail over changing an unauthorized element.
            """;

    private static final List<SlidePrompt> PROMPTS = Collections.unmodifiableList(Arrays.asList(
            prompt("CREATE_NEW_SLIDE", "✨ สร้างสไลด์ใหม่", """
                    NO-DRIFT SLIDE PRODUCTION MODE
                    MODE: CREATE_NEW_SLIDE
                    """ + GLOBAL_RULES + """

                    REFERENCE ROLES
                    MASTER_REFERENCE controls Visual DNA only:
                    - palette and color roles
                    - typography hierarchy
                    - icon family
                    - product/image treatment
                    - lighting, material, depth, and atmosphere
                    - spacing rhythm and overall visual character

                    Do not display, merge, or copy MASTER_REFERENCE into the output.

                    CONTENT_SOURCE — USE EXACTLY
                    [วางข้อความของสไลด์]
                    CONTENT_SOURCE controls the exact wording and meaning.
                    Do not invent, add, reduce, summarize, or rewrite supplied copy.
                    Optional decoration may be omitted instead of invented, but never omit, shorten, or alter required CONTENT_SOURCE.

                    SLIDE TYPE
                    [Cover / Product Showcase / Problem / Results / Process / Other]

                    SLIDE PURPOSE
                    [หน้าที่ของสไลด์นี้]

                    PRIMARY HERO
                    [สิ่งที่ต้องเด่นที่สุด]

                    INHERIT FROM MASTER
                    - Palette + color roles: [...]
                    - Typography hierarchy: [...]
                    - Icon family: [...]
                    - Product identity: [...]
                    - Visual treatment: [...]
                    - Composition character: [...]
                    - Information density: [...]

                    CREATIVE FREEDOM — ONLY
                    Create a new composition suitable for this slide's meaning while preserving the inherited visual system.
                    [ระบุอิสระเพิ่มเติม หรือเขียน NONE]

                    LOCK
                    - exact supplied copy and meaning
                    - inherited color roles and typography hierarchy
                    - icon family and visual treatment
                    - deck identity and 16:9 format

                    FINAL CHECK BEFORE OUTPUT
                    - one slide only
                    - copy matches CONTENT_SOURCE
                    - no color spread
                    - Visual DNA matches MASTER_REFERENCE

                    OUTPUT
                    Exactly one independent presentation slide image.
                    """),
            prompt("PATCH_APPROVED_SLIDE", "🩹 แก้สไลด์ที่ผ่านแล้ว", """
                    NO-DRIFT SLIDE PRODUCTION MODE
                    MODE: PATCH_APPROVED_SLIDE
                    """ + GLOBAL_RULES + """

                    BASE_SLIDE
                    Use the attached latest approved slide as the sole source of truth for layout, composition, content, position, scale, images, icons, and styling.
                    BASE_SLIDE controls the exact existing content and wording.
                    Always restart from the latest APPROVED BASE_SLIDE.
                    Never use a rejected or drifted output as the new baseline.
                    If the latest approved BASE_SLIDE is not attached or its approval is ambiguous, stop and request it. Do not generate or infer a baseline.

                    CREATIVE FREEDOM: NONE
                    One PATCH request must contain exactly one Delta.

                    CHANGE ONLY
                    Target: [...]
                    Property: [...]
                    Current: [...]
                    Required: [...]
                    Purpose: [...]

                    LOCK — PRESERVE VISUALLY IDENTICAL
                    - all other text and wording
                    - layout, composition, positions, scale, and spacing
                    - typography hierarchy
                    - images, crop, icons, background, lighting, texture, and shadows
                    - palette and color roles outside the named target

                    ZERO PERMISSION
                    No other change is authorized.
                    Do not redesign, rebalance, harmonize, remaster, or improve unrelated areas.
                    Do not spread the requested change to another element.

                    FINAL CHECK BEFORE OUTPUT
                    - one slide only
                    - the requested Delta is applied
                    - no unrelated element changed
                    - copy remains exact
                    - no color spread

                    OUTPUT
                    Exactly one independent presentation slide image.
                    """)
    ));

    private SlidePromptCatalog() {}

    public static List<SlidePrompt> all() {
        return PROMPTS;
    }

    public static SlidePrompt byId(String id) {
        for (SlidePrompt prompt : PROMPTS) {
            if (prompt.id.equals(id)) return prompt;
        }
        throw new IllegalArgumentException("Unknown slide prompt: " + id);
    }

    private static SlidePrompt prompt(String id, String label, String prompt) {
        return new SlidePrompt(id, label, prompt.strip());
    }
}
