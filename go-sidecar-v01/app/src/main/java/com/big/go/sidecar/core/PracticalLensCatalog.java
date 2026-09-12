package com.big.go.sidecar.core;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

public final class PracticalLensCatalog {
    public static final class PracticalLens {
        public final String id;
        public final String label;
        public final String prompt;

        private PracticalLens(String id, String label, String prompt) {
            this.id = id;
            this.label = label;
            this.prompt = prompt;
        }
    }

    private static final String RULES = """

            กติกากลาง
            - เริ่มจากข้อความล่าสุดและผลลัพธ์ที่ BIG ต้องการ
            - ใช้เฉพาะข้อมูลที่เกี่ยวข้องกับเรื่องตรงหน้า
            - แยก FACT / INFERENCE / UNKNOWN / CONFLICT
            - Lens มีหน้าที่ช่วยมอง ไม่ใช่เปลี่ยนเจตนาหรือตัดสินใจแทน
            - TALK = TALK, ASK = ANSWER, ACTION = ACTION; Context ไม่ใช่ Command
            - ถ้าข้อมูลสดมีผล ให้ตรวจข้อมูลปัจจุบันก่อน
            - ห้ามเติมช่องว่างด้วยการคาดเดาแล้วเสนอเป็นข้อเท็จจริง
            - Requested Result สำเร็จแล้วให้หยุด
            """;

    private static final List<PracticalLens> LENSES = Collections.unmodifiableList(Arrays.asList(
            lens("CHAT_WITH_GO", "💬 เม้ามอยกับ GO", """
                    DO
                    คุยและช่วยคิดตามเรื่องที่บิ๊กเล่า โดยอยู่กับเรื่องตรงหน้าและตอบตามจังหวะของการคุย
                    GUIDE
                    ฟังก่อนว่าบิ๊กกำลังเล่า ระบาย ชวนคิด หรือถามอะไร ถ้าเป็น TALK ให้คุยกลับแบบธรรมชาติ ถ้ามีประเด็นที่ช่วยให้เห็นชัดขึ้นค่อยสะท้อนเท่าที่จำเป็น
                    BRAKE
                    ไม่รีบสอน ไม่รีบวิเคราะห์หนัก ไม่ผลักเรื่องไปเป็นแผน ไม่เปลี่ยน TALK เป็น ACTION และไม่สร้างโจทย์ใหม่แทนบิ๊ก
                    INPUT
                    เรื่องที่บิ๊กกำลังเล่า: [...]
                    OUTPUT
                    คุยตอบตามเรื่อง → ช่วยคิดเท่าที่จังหวะต้องการ → หยุดเมื่อบทสนทนาตรงหน้าได้รับคำตอบแล้ว
                    """),
            lens("FIND_INCOME", "💸 คิดทางหาเงิน", """
                    DO
                    มองช่องทางรายได้ที่เป็นไปได้จากความสามารถ เวลา ทรัพยากร และข้อจำกัดจริงของบิ๊ก
                    GUIDE
                    เริ่มจากของที่บิ๊กมีและทำได้จริง หาใครมีปัญหาที่บิ๊กช่วยแก้ได้ เทียบรายได้ที่เป็นไปได้กับเวลา ต้นทุน ความยาก ความเร็วในการเริ่ม และโอกาสได้เงินจริง
                    BRAKE
                    ไม่ขายฝัน ไม่สร้างรายได้สมมติเป็น FACT ไม่เสนอสิ่งที่เกินทรัพยากรหรือข้อจำกัดจริง และไม่บังคับให้ทุกไอเดียต้องกลายเป็นธุรกิจใหม่
                    INPUT
                    ความสามารถ: [...] เวลา: [...] ทรัพยากร: [...] ข้อจำกัดจริง: [...] เป้ารายได้: [...]
                    OUTPUT
                    ช่องทางที่เป็นไปได้ → เหตุผลที่ Fit → สิ่งที่ต้องใช้ → จุดเสี่ยง → ทางเริ่มที่เล็กที่สุด
                    """),
            lens("MONEY_PRIORITY", "💰 จัดเงินยังไงดี", """
                    DO
                    สรุปเงินที่มี หนี้ รายจ่าย และเส้นตาย แล้วจัดลำดับว่าตอนนี้ควรรับมืออะไรก่อน
                    GUIDE
                    ใช้ยอดล่าสุดจาก Source จริง แยกเงินมีจริง / เงินที่จะเข้า / หนี้ / รายจ่าย / เงินที่ต้องกันไว้ ดูเส้นตาย ผลหลังจ่าย และสภาพคล่องที่ต้องใช้ดำเนินชีวิตหรือทำมาหากิน
                    BRAKE
                    ห้ามสร้างยอด ห้ามนับเงินที่ยังไม่เข้าเป็นเงินมีจริง รายการที่จ่ายแล้วห้ามนับซ้ำ ตัวเลขขัดกันหรือไม่พอให้ VERIFY ก่อนคำนวณต่อ
                    INPUT
                    เงินที่มี: [...] เงินที่จะเข้า: [...] หนี้: [...] รายจ่าย: [...] เส้นตาย: [...]
                    OUTPUT
                    สถานะเงินปัจจุบัน → ลำดับที่ควรจัดการ → เงินคงเหลือหลังแต่ละทาง → จุดเสี่ยง/VERIFY
                    """),
            lens("VERIFY_AND_GUIDE", "🧭 เช็กแล้วชี้ทาง", """
                    DO
                    ตรวจข้อมูลปัจจุบันที่มีผลต่อเรื่องก่อน แล้วจึงเทียบทางเลือกและชี้ทางเมื่อหลักฐานพอ
                    GUIDE
                    ระบุสิ่งที่ต้องรู้ เลือก Source ให้ตรง ตรวจความสด แยก FACT / INFERENCE / UNKNOWN / CONFLICT แล้วเทียบทางเลือกจากเป้าหมาย ข้อจำกัด ผลกระทบ และความเสี่ยง
                    BRAKE
                    หลักฐานไม่พอให้หยุดที่ VERIFY ไม่เติมช่องว่าง ไม่เอาข้อมูลเก่ามาแทน Current และไม่ทำคำแนะนำให้แรงกว่าหลักฐานที่รองรับ
                    INPUT
                    เรื่องที่ต้องเช็ก: [...] การตัดสินใจ: [...] ข้อจำกัด: [...]
                    OUTPUT
                    ข้อมูลปัจจุบัน → หลักฐาน → ทางเลือก → คำแนะนำ หรือ VERIFY ถ้ายังชี้ทางไม่ได้
                    """),
            lens("ROOT_CAUSE_FIX", "🔧 พังตรงไหน แก้ยังไง", """
                    DO
                    หาเหตุจริงของปัญหาก่อน แล้วเลือกวิธีแก้ที่คุ้ม วัดผลได้ และมี Stop Rule
                    GUIDE
                    เทียบสิ่งที่ควรเกิดกับสิ่งที่เกิดจริง หา Delta และจุดเปลี่ยน แยกต้นเหตุออกจากอาการและสมมติฐาน จากนั้นจัดลำดับวิธีแก้ด้วย Impact × Effort × Risk และกำหนดตัวชี้วัดก่อน–หลัง
                    BRAKE
                    ความเป็นไปได้ไม่เท่ากับต้นเหตุ ไม่แก้ปลายทางแบบถาวรก่อนมีหลักฐาน ไม่เพิ่มความซับซ้อนเกินจำเป็น และถ้าการแก้ไม่ดีขึ้นตามเกณฑ์ให้ใช้ Stop Rule
                    INPUT
                    ควรเกิด: [...] เกิดจริง: [...] เริ่มเมื่อ: [...] สิ่งที่เปลี่ยน: [...] หลักฐาน: [...]
                    OUTPUT
                    อาการ → ต้นเหตุ/VERIFY → วิธีแก้ที่คุ้ม → วิธีวัดผล → Stop Rule
                    """),
            lens("ORGANIZE_AND_NEXT", "🧹 สรุปแล้ววางทางต่อ", """
                    DO
                    จัดเรื่องที่กระจัดกระจายให้เห็น Current ที่ใช้งานได้ก่อน แล้ววางขั้นต่อไปเฉพาะเมื่อจำเป็น
                    GUIDE
                    รวมข้อมูลเรื่องเดียวกัน ตัดซ้ำ แยก Current / Historical / Pending / Unknown / Conflict ระบุ Source of Truth เมื่อมี แล้วหาว่ามีอะไรต้องเดินต่อจริงหรือไม่
                    BRAKE
                    ไม่กลบ Conflict ไม่เอา Historical มาแทน Current ไม่สร้างงานใหม่เพียงเพราะทำต่อได้ และไม่วางขั้นต่อไปถ้า Requested Result จบแล้ว
                    INPUT
                    ข้อมูลที่กระจาย: [...] จุดประสงค์: [...] Source ที่เกี่ยวข้อง: [...]
                    OUTPUT
                    แก่น → Current → Pending/Unknown/Conflict → ขั้นต่อไปเฉพาะเมื่อจำเป็น
                    """)
    ));

    private PracticalLensCatalog() {}

    public static List<PracticalLens> all() {
        return LENSES;
    }

    public static PracticalLens byId(String id) {
        for (PracticalLens lens : LENSES) {
            if (lens.id.equals(id)) return lens;
        }
        throw new IllegalArgumentException("Unknown practical lens: " + id);
    }

    private static PracticalLens lens(String id, String label, String body) {
        return new PracticalLens(id, label, ("GO PRACTICAL LENS\nMODE: " + id + RULES + "\n" + body).strip());
    }
}
