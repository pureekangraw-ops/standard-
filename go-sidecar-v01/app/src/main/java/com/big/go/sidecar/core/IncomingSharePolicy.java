package com.big.go.sidecar.core;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class IncomingSharePolicy {
    public static final int MAX_IMAGES = 10;

    private IncomingSharePolicy() {}

    public static boolean isSupported(String action, String mimeType, int imageCount) {
        boolean shareAction = "android.intent.action.SEND".equals(action)
                || "android.intent.action.SEND_MULTIPLE".equals(action);
        return shareAction
                && mimeType != null
                && mimeType.startsWith("image/")
                && imageCount >= 1
                && imageCount <= MAX_IMAGES;
    }

    public static List<String> uniqueUris(List<String> values) {
        if (values == null || values.isEmpty()) return Collections.emptyList();
        ArrayList<String> result = new ArrayList<>();
        for (String value : values) {
            if (value == null) continue;
            String clean = value.trim();
            if (!clean.isEmpty() && !result.contains(clean)) {
                result.add(clean);
            }
        }
        return result;
    }
}
