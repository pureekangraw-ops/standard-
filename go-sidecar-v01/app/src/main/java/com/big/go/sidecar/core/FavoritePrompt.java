package com.big.go.sidecar.core;

public final class FavoritePrompt {
    public final String id;
    public final String name;
    public final String prompt;

    public FavoritePrompt(String id, String name, String prompt) {
        String cleanId = clean(id);
        String cleanName = clean(name);
        String cleanPrompt = clean(prompt);
        if (cleanId.isEmpty() || cleanName.isEmpty() || cleanPrompt.isEmpty()) {
            throw new IllegalArgumentException("id, name and prompt are required");
        }
        this.id = cleanId;
        this.name = cleanName;
        this.prompt = cleanPrompt;
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim();
    }
}
