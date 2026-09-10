package com.big.go.sidecar.core;

public final class ClipboardAssistantPolicy {
    public enum Action {
        SEND,
        SUMMARIZE,
        DRAFT_REPLY,
        CHECK,
        TRANSLATE
    }

    private ClipboardAssistantPolicy() {}

    public static String packageText(Action action, String text) {
        if (text == null || text.trim().isEmpty()) {
            throw new IllegalArgumentException("clipboard text is blank");
        }
        if (action == null) {
            throw new IllegalArgumentException("action is required");
        }

        switch (action) {
            case SEND:
                return text;
            case SUMMARIZE:
                return "ช่วยสรุปข้อความนี้ให้กระชับและเก็บสาระสำคัญ:\n\n" + text;
            case DRAFT_REPLY:
                return "ช่วยร่างคำตอบสำหรับข้อความนี้ โดยยึดข้อมูลที่มีและอย่าเดารายละเอียดที่ไม่มี:\n\n" + text;
            case CHECK:
                return "ช่วยตรวจข้อความนี้ หาใจความ จุดผิด ความเสี่ยง หรือสิ่งที่ควรแก้ โดยไม่เปลี่ยนความหมายเดิม:\n\n" + text;
            case TRANSLATE:
                return "ช่วยแปลข้อความนี้ให้เหมาะกับบริบท ถ้าภาษาปลายทางไม่ชัดให้เลือกไทยหรืออังกฤษตามต้นฉบับ:\n\n" + text;
            default:
                throw new IllegalArgumentException("unsupported action");
        }
    }
}
