package com.big.go.sidecar.core;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class GallerySharePolicyTest {
    @Test
    public void gallerySelectionRoutesDirectlyToChatGptWithoutSidecarApi() {
        assertEquals("com.openai.chatgpt", GallerySharePolicy.CHATGPT_PACKAGE);
        assertEquals("image/*", GallerySharePolicy.IMAGE_MIME);
        assertFalse(GallerySharePolicy.USES_SIDECAR_API);
        assertTrue(GallerySharePolicy.USER_MUST_SEND);
    }
}
