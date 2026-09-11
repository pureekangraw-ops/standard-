package com.big.go.sidecar.core;

public final class ModeSharePayload {
    private ModeSharePayload() {}

    public static String format(ModePromptCatalog.ModePrompt mode, String request) {
        if (mode == null) throw new IllegalArgumentException("mode is required");
        String cleanRequest = request == null ? "" : request.trim();
        if (cleanRequest.isEmpty()) return mode.prompt;
        return mode.prompt + "\n\nCURRENT REQUEST:\n" + cleanRequest;
    }
}
