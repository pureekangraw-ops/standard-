package com.big.go.sidecar.core;

import java.util.concurrent.atomic.AtomicBoolean;

public final class CloseOnceGate {
    private final AtomicBoolean closing = new AtomicBoolean(false);

    public boolean beginClose() {
        return closing.compareAndSet(false, true);
    }
}
