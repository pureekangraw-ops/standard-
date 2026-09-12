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
            - ใช้ Lens เท่าที่จำเป็น แล้วหยุดเมื่อได้ผลลัพธ์ที่ใช้ตัดสินใจได้
            - ถ้าข้อมูลสดมีผล ให้ตรวจข้อมูลปัจจุบันก่อน
            - ห้ามเติมช่องว่างด้วยการคาดเดาแล้วเสนอเป็นข้อเท็จจริง
            """;

    private static final List<PracticalLens> LENSES = Collections.unmodifiableList(Arrays.asList(
            lens("CHOOSE_PATH", "🧭 เลือกทาง", """
                    DO
                    นำเป้าหมาย สถานการณ์จริง เงิน เวลา ความสามารถ ข้อจำกัด และตัวเลือกมาชนกัน แล้วบอกว่าตอนนี้ควรเลือกทางไหน
                    GUIDE
                    ระบุเป้าหมาย ตรวจข้อมูลที่เปลี่ยนได้ และเทียบผลกระทบ ค่าใช้จ่าย เวลา ความเสี่ยง และความย้อนกลับได้ ให้ความสำคัญกับสิ่งที่พิสูจน์แล้ว
                    BRAKE
                    ไม่เลือกจากตัวแปรเดียว ไม่ยกวิธีคนอื่นมาใช้โดยไม่ตรวจ Fit ข้อมูลไม่พอให้คง UNKNOWN / VERIFY
                    INPUT
                    เป้าหมาย: [...] สถานการณ์: [...] ตัวเลือก: [...] ข้อจำกัด: [...]
                    OUTPUT
                    ทางที่แนะนำ → เหตุผล → สิ่งที่ต้องแลก → ความเสี่ยง → จุดตรวจเพิ่ม
                    """),
            lens("LIVE_SITUATION", "⚡ ดูสถานการณ์ตอนนี้", """
                    DO
                    ตรวจว่า ณ ตอนนี้มีอะไรเกิดขึ้น เปลี่ยนไป ค้างอยู่ หรือใกล้ถึงกำหนด และคัดเฉพาะสิ่งที่มีผลต่อ BIG
                    GUIDE
                    ตรวจเวลาและความสด แยกสถานะล่าสุดจากข้อมูลเก่า เรียงตามความเร่งด่วน และตรวจแหล่งล่าสุดเมื่อข้อมูลภายนอกมีผล
                    BRAKE
                    ข้อมูลเก่าไม่ใช่ Current ปฏิทินไม่ยืนยันว่างานเสร็จ ไม่รายงานทุกอย่างเพียงเพราะค้นเจอ
                    INPUT
                    เรื่องที่ตรวจ: [...] พื้นที่/เวลา: [...] การตัดสินใจ: [...]
                    OUTPUT
                    สถานะตอนนี้ → สิ่งที่เปลี่ยน → ผลต่อ BIG → Action
                    """),
            lens("ROOT_CAUSE", "🕵️ หาต้นเหตุ", """
                    DO
                    หาว่าปัญหาเกิดจากอะไรจริง โดยไล่จากอาการไปยังหลักฐานและจุดที่ทำให้สิ่งปกติกลายเป็นผิดปกติ
                    GUIDE
                    เทียบสิ่งที่ควรเกิดกับสิ่งที่เกิดจริง หา Delta ก่อนเริ่มปัญหา แยกสาเหตุจากสมมติฐาน และทดลองทีละตัวเมื่อทำได้
                    BRAKE
                    ความเป็นไปได้ไม่เท่ากับสาเหตุ ไม่แก้ปลายทางก่อนรู้ต้นเหตุ ถ้ายังพิสูจน์ไม่ได้ให้คง UNKNOWN
                    INPUT
                    ควรเกิด: [...] เกิดจริง: [...] เริ่มเมื่อ: [...] สิ่งที่เปลี่ยน: [...] หลักฐาน: [...]
                    OUTPUT
                    อาการ → Failure chain → ต้นเหตุ/สมมติฐาน → หลักฐาน → วิธีพิสูจน์
                    """),
            lens("PERFORMANCE_FIX", "🚀 หาจุดแก้ที่คุ้มสุด", """
                    DO
                    หาคอขวดที่กระทบผลลัพธ์มากที่สุด เลือกการแก้ที่คุ้ม และกำหนดวิธีวัดว่าดีขึ้นจริง
                    GUIDE
                    หาเวลาที่เสีย งานซ้ำ จุดรอ และความผิดพลาด จัดลำดับ Impact × Effort × Risk เลือกจุดเปลี่ยนแรกและตั้งค่าก่อน–หลัง
                    BRAKE
                    ไม่เพิ่มขั้นตอนเพื่อให้ดูครบ Local improvement ต้องไม่ทำให้ระบบรวมแย่ลง ไม่วัดจากความรู้สึกอย่างเดียว และต้องมี Stop Rule
                    INPUT
                    กระบวนการ: [...] ปัญหาซ้ำ: [...] เวลา/รอบ: [...] ผลที่ต้องการ: [...]
                    OUTPUT
                    คอขวด → จุดแก้ก่อน → วิธีแก้ → ตัวชี้วัด → Stop Rule
                    """),
            lens("COMPARE_SCENARIOS", "🔮 เทียบสถานการณ์", """
                    DO
                    จำลองผลของแต่ละทางเลือกจากข้อมูลเดียวกัน เพื่อให้เห็นผลหากเลือกต่างกัน
                    GUIDE
                    เปิดสมมติฐาน คำนวณเงิน เวลา ความเสี่ยง และผลต่อแผนถัดไป แล้วประเมินว่าอะไร Fit กับชีวิตจริง
                    BRAKE
                    Simulation ไม่ใช่อนาคต ห้ามซ่อนสมมติฐาน ไม่ทำตัวเลขแม่นเกินข้อมูล ข้อมูลไม่พอให้ใช้ช่วงหรือ UNKNOWN
                    INPUT
                    A: [...] B: [...] ทรัพยากร: [...] ค่าใช้จ่าย/รายได้: [...] เส้นตาย: [...]
                    OUTPUT
                    ผลแต่ละทาง → จุดคุ้มทุน → ความเสี่ยง → ทางที่เหมาะกว่า
                    """),
            lens("ORGANIZE_REALITY", "🧹 จัดของที่กระจาย", """
                    DO
                    รวมข้อมูลเรื่องเดียวกัน ตัดซ้ำ แยกหน้าที่และสถานะ แล้วจัดให้ค้นเจอและใช้ต่อได้
                    GUIDE
                    แยก Current / Historical / Pending / Unknown ระบุ Source of Truth และรวมของซ้ำโดยไม่กลบ Conflict
                    BRAKE
                    ไม่ลบความต่างจริง Historical ไม่ใช่ Current ไม่สร้างสถานะคู่ขนาน และไม่แก้ต้นทางโดยไม่มีสิทธิ์
                    INPUT
                    ข้อมูล: [...] จุดประสงค์: [...] Source of Truth: [...]
                    OUTPUT
                    แก่น → Current → หมวด → Conflict/Unknown → งานถัดไป
                    """),
            lens("DESIGN_WORKFLOW", "🛠️ ออกแบบทางทำงาน", """
                    DO
                    ออกแบบหรือปรับเส้นทางการทำงานตั้งแต่เริ่มจนจบ ให้ทุกขั้นรับใช้เจตนา ลดจุดชน และส่งต่องานต่อเนื่อง
                    GUIDE
                    วาง Input → Decision → Action → Handoff → Result ระบุ Owner หา bottleneck/dependency และตรวจ Update, Backup, Recovery, Permission ตามจำเป็น
                    BRAKE
                    ไม่สร้างเป้าหมายใหม่ ความสะดวกทางเทคนิคไม่ใช่สิทธิ์เปลี่ยนความหมาย ไม่เพิ่มของเพราะดูเป็นแนวปฏิบัติที่ดี
                    INPUT
                    ผู้ใช้: [...] ผลลัพธ์: [...] Flow ปัจจุบัน: [...] ปัญหา: [...] ข้อจำกัด: [...]
                    OUTPUT
                    Flow → Owner → จุดเสี่ยง → สิ่งที่ทำก่อน → วิธีทดสอบจริง
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
