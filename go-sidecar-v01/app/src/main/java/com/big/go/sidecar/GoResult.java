package com.big.go.sidecar;

final class GoResult {
    final String kind;
    final String draft;
    final String reason;
    final String observed;

    GoResult(String kind, String draft, String reason) {
        this(kind, draft, reason, "");
    }

    GoResult(String kind, String draft, String reason, String observed) {
        this.kind = kind == null ? "UNKNOWN" : kind;
        this.draft = draft == null ? "" : draft;
        this.reason = reason == null ? "" : reason;
        this.observed = observed == null ? "" : observed;
    }
}
