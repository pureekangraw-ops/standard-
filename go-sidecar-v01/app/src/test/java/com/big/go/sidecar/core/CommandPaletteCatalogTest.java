package com.big.go.sidecar.core;

import org.junit.Test;
import java.util.List;
import static org.junit.Assert.*;

public class CommandPaletteCatalogTest {
    @Test public void primaryCommandsStayFocused() {
        List<CommandPaletteCatalog.Command> items = CommandPaletteCatalog.primary();
        assertEquals(4, items.size());
        assertEquals("TALK", items.get(0).id);
        assertEquals("ASK", items.get(1).id);
        assertEquals("ACTION", items.get(2).id);
        assertEquals("VERIFY", items.get(3).id);
    }

    @Test public void moreCommandsContainSecondaryLocks() {
        List<CommandPaletteCatalog.Command> items = CommandPaletteCatalog.more();
        assertEquals(4, items.size());
        assertEquals("DECIDE", items.get(0).id);
        assertEquals("GROW", items.get(1).id);
        assertEquals("READ_ONLY", items.get(2).id);
        assertEquals("CURRENT", items.get(3).id);
    }

    @Test public void sourceLockEditIsContextualNotPrimary() {
        assertFalse(CommandPaletteCatalog.primary().stream().anyMatch(x -> x.id.equals("SOURCE_LOCK_EDIT")));
        assertTrue(CommandPaletteCatalog.contextual().stream().anyMatch(x -> x.id.equals("SOURCE_LOCK_EDIT")));
        CommandPaletteCatalog.Command sourceLock = CommandPaletteCatalog.byId("SOURCE_LOCK_EDIT");
        assertTrue(sourceLock.prompt.contains("Source of Truth"));
        assertTrue(sourceLock.prompt.contains("1 สไลด์ = 1 ภาพอิสระ"));
        assertTrue(sourceLock.prompt.contains("แก้เฉพาะสิ่งที่สั่ง"));
        assertTrue(sourceLock.prompt.contains("คงเดิม"));
        assertTrue(sourceLock.prompt.contains("ห้ามเพิ่ม / ตัด / ตีความใหม่"));
        assertTrue(sourceLock.prompt.contains("ขนาดและสัดส่วน = เท่าต้นฉบับ"));
    }
}
