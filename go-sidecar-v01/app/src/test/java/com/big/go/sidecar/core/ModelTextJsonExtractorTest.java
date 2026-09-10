package com.big.go.sidecar.core;

import org.junit.Test;
import static org.junit.Assert.*;

public class ModelTextJsonExtractorTest {
    @Test public void extractsObjectInsideFence() {
        assertEquals("{\"kind\":\"REPLY\"}", ModelTextJsonExtractor.extract("```json\n{\"kind\":\"REPLY\"}\n```"));
    }
    @Test public void ignoresBracesInsideStrings() {
        assertEquals("{\"reason\":\"x { y }\"}", ModelTextJsonExtractor.extract("before {\"reason\":\"x { y }\"} after"));
    }
    @Test public void returnsNullWithoutObject() {
        assertNull(ModelTextJsonExtractor.extract("hello"));
    }
}
