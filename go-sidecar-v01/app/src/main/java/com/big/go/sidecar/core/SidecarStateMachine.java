package com.big.go.sidecar.core;

public final class SidecarStateMachine {
    private SidecarStateMachine() {}

    public static SidecarState reduce(SidecarState state, SidecarEvent event) {
        if (event == SidecarEvent.RESET || event == SidecarEvent.CLOSE || event == SidecarEvent.CONSENT_DENIED) {
            return SidecarState.IDLE;
        }
        switch (state) {
            case IDLE:
                return event == SidecarEvent.ASK_GO ? SidecarState.CONSENT : state;
            case CONSENT:
                return event == SidecarEvent.CONSENT_GRANTED ? SidecarState.CAPTURING : state;
            case CAPTURING:
                if (event == SidecarEvent.CAPTURE_READY) return SidecarState.PREVIEW;
                if (event == SidecarEvent.CAPTURE_FAILED) return SidecarState.ERROR;
                return state;
            case PREVIEW:
                return event == SidecarEvent.ANALYZE ? SidecarState.ANALYZING : state;
            case ANALYZING:
                if (event == SidecarEvent.ANALYSIS_OK) return SidecarState.DRAFT;
                if (event == SidecarEvent.ANALYSIS_FAILED) return SidecarState.ERROR;
                return state;
            case DRAFT:
            case ERROR:
            default:
                return state;
        }
    }
}
