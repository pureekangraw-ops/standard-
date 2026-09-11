package com.big.go.sidecar.core;

public final class AppDisplayName {
    private AppDisplayName() {}

    public static String forVersion(String versionName) {
        if (versionName == null || versionName.trim().isEmpty()) return "GO Sidecar";
        return "GO Sidecar v" + versionName.trim();
    }
}
