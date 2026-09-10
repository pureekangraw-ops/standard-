package com.big.go.sidecar.core;

import org.junit.Test;
import static org.junit.Assert.assertEquals;

public class SidecarStateMachineTest {
    @Test public void followsCaptureDraftFlow() {
        assertEquals(SidecarState.CONSENT, SidecarStateMachine.reduce(SidecarState.IDLE, SidecarEvent.ASK_GO));
        assertEquals(SidecarState.CAPTURING, SidecarStateMachine.reduce(SidecarState.CONSENT, SidecarEvent.CONSENT_GRANTED));
        assertEquals(SidecarState.PREVIEW, SidecarStateMachine.reduce(SidecarState.CAPTURING, SidecarEvent.CAPTURE_READY));
        assertEquals(SidecarState.ANALYZING, SidecarStateMachine.reduce(SidecarState.PREVIEW, SidecarEvent.ANALYZE));
        assertEquals(SidecarState.DRAFT, SidecarStateMachine.reduce(SidecarState.ANALYZING, SidecarEvent.ANALYSIS_OK));
    }

    @Test public void analysisFailureBecomesError() {
        assertEquals(SidecarState.ERROR, SidecarStateMachine.reduce(SidecarState.ANALYZING, SidecarEvent.ANALYSIS_FAILED));
    }
}
