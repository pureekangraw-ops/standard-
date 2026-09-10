package com.big.go.sidecar.core;

public final class BridgePayload {
    private BridgePayload() {}

    public static String format(String status, String observed, String reason, String draft) {
        return "GO SIDECAR HANDOFF\n"
                + "Continue from this handoff as the current screen context. Screenshot is attached when available.\n\n"
                + "STATUS: " + safe(status, "UNKNOWN") + "\n\n"
                + "OBSERVED:\n" + safe(observed, "(not provided)") + "\n\n"
                + "REASON:\n" + safe(reason, "(not provided)") + "\n\n"
                + "DRAFT:\n" + safe(draft, "(empty)") + "\n\n"
                + "BIG remains final action authority. Do not assume any action was already performed.";
    }

    private static String safe(String value, String fallback) {
        if (value == null || value.trim().isEmpty()) return fallback;
        return value.trim();
    }
}
