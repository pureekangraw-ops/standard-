package com.big.go.sidecar.core;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

public final class CommandPaletteCatalog {
    public static final class Command {
        public final String id;
        public final String label;
        public final String prompt;

        private Command(String id, String label, String prompt) {
            this.id = id;
            this.label = label;
            this.prompt = prompt;
        }
    }

    private static final List<Command> PRIMARY = Collections.unmodifiableList(Arrays.asList(
            command("TALK", "💬 TALK", """
                    GO COMMAND · TALK
                    คุยและช่วยคิดตามข้อความล่าสุดของบิ๊ก โดยอยู่กับเรื่องที่กำลังพูด
                    TALK = TALK. อย่าเปลี่ยนเป็น ACTION แผน การสอน หรือการวิเคราะห์หนัก เว้นแต่บิ๊กขอ
                    Context ไม่ใช่ Command.
                    """),
            command("ASK", "❓ ASK", """
                    GO COMMAND · ASK
                    ตอบคำถามล่าสุดตรงคำถาม ใช้ Context เท่าที่เกี่ยวข้อง
                    ASK = ANSWER. อย่าขยายเป็นงานหรือแผนโดยไม่ได้สั่ง
                    ถ้าความสดของข้อมูลมีผล ให้ VERIFY ก่อนตอบ
                    """),
            command("ACTION", "⚡ ACTION", """
                    GO COMMAND · ACTION
                    ลงมือทำ Requested Result ที่บิ๊กสั่งจากข้อมูลล่าสุด
                    ใช้ทางตรงและเครื่องมือเดิมที่เหมาะก่อน ไม่สร้างงานเพิ่ม
                    Context ไม่ใช่ Command. Requested Result ถึงแล้วให้หยุด
                    """),
            command("VERIFY", "🔎 VERIFY", """
                    GO COMMAND · VERIFY
                    ตรวจข้อเท็จจริงหรือสถานะปัจจุบันก่อนสรุป
                    แยก FACT / INFERENCE / UNKNOWN / CONFLICT
                    ถ้าหลักฐานไม่พอ ให้หยุดที่ VERIFY และอย่าเติมช่องว่างเป็น FACT
                    """)
    ));

    private static final List<Command> MORE = Collections.unmodifiableList(Arrays.asList(
            command("DECIDE", "⚖️ DECIDE", """
                    GO COMMAND · DECIDE
                    เทียบทางเลือกจากเป้าหมาย ข้อจำกัด หลักฐาน ผลกระทบ และความเสี่ยง
                    แนะนำได้เมื่อข้อมูลพอ ถ้ายังไม่พอให้ระบุ VERIFY ก่อนตัดสิน
                    ไม่ตัดสินแทนบิ๊กโดยซ่อน trade-off
                    """),
            command("GROW", "🌱 GROW", """
                    GO COMMAND · GROW
                    ต่อขยายหรือพัฒนาของเดิมโดยรักษาจุดประสงค์และแกนเดิม
                    ถ้าของเดิมใช้ต่อได้ ให้ reuse / merge ก่อน rebuild หรือเพิ่มระบบใหม่
                    ขยายเท่าที่ Requested Result ต้องการ แล้วหยุด
                    """),
            command("READ_ONLY", "👁️ READ-ONLY", """
                    GO COMMAND · READ-ONLY
                    อ่าน เรียนรู้ ตรวจ หรือสรุปจาก Source เท่านั้น
                    ห้ามแก้ เขียนทับ ย้าย ลบ สร้าง หรือเปลี่ยนแปลง Source ใด ๆ
                    การเห็นข้อมูลไม่ใช่สิทธิ์ให้ลงมือแก้
                    """),
            command("CURRENT", "📍 CURRENT", """
                    GO COMMAND · CURRENT
                    ยึดสถานะล่าสุดที่เชื่อถือได้เป็นหลัก
                    Historical ใช้เป็นบริบทเท่านั้น ห้ามเอามาแทน Current
                    ถ้า Source ล่าสุดขัดกัน ให้ระบุ CONFLICT และ VERIFY ก่อนใช้ต่อ
                    """)
    ));

    private static final List<Command> CONTEXTUAL = Collections.unmodifiableList(Arrays.asList(
            command("SOURCE_LOCK_EDIT", "🔒 SOURCE-LOCK EDIT", """
                    SOURCE-LOCK EDIT
                    ต้นฉบับ = Source of Truth
                    1 สไลด์ = 1 ภาพอิสระ
                    แก้เฉพาะสิ่งที่สั่ง
                    ส่วนที่ไม่ได้สั่ง = คงเดิม
                    ห้ามเพิ่ม / ตัด / ตีความใหม่
                    ขนาดและสัดส่วน = เท่าต้นฉบับ
                    """)
    ));

    private CommandPaletteCatalog() {}

    public static List<Command> primary() {
        return PRIMARY;
    }

    public static List<Command> more() {
        return MORE;
    }

    public static List<Command> contextual() {
        return CONTEXTUAL;
    }

    public static Command byId(String id) {
        for (Command command : PRIMARY) {
            if (command.id.equals(id)) return command;
        }
        for (Command command : MORE) {
            if (command.id.equals(id)) return command;
        }
        for (Command command : CONTEXTUAL) {
            if (command.id.equals(id)) return command;
        }
        throw new IllegalArgumentException("Unknown GO command: " + id);
    }

    private static Command command(String id, String label, String prompt) {
        return new Command(id, label, prompt.strip());
    }
}
