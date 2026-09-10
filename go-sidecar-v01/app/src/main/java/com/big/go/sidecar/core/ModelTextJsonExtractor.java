package com.big.go.sidecar.core;

public final class ModelTextJsonExtractor {
    private ModelTextJsonExtractor() {}

    public static String extract(String text) {
        if (text == null) return null;
        int start = text.indexOf('{');
        if (start < 0) return null;
        boolean inString = false;
        boolean escaped = false;
        int depth = 0;
        for (int i = start; i < text.length(); i++) {
            char c = text.charAt(i);
            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (c == '\\') {
                    escaped = true;
                } else if (c == '"') {
                    inString = false;
                }
                continue;
            }
            if (c == '"') {
                inString = true;
            } else if (c == '{') {
                depth++;
            } else if (c == '}') {
                depth--;
                if (depth == 0) return text.substring(start, i + 1);
            }
        }
        return null;
    }
}
