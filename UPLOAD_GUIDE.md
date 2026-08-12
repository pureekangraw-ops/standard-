# NormalPocket Upload Guide

NormalPocket ใช้ Worker แยกชื่อ `normalpocket` และต้องผ่าน Safety Gate ก่อน Deploy ทุกครั้ง

## GitHub / Cloudflare Builds

1. เปิด Pull Request ตามปกติ
2. รอ `STANDARD Safety Gate` ให้ผ่าน
3. Branch ที่ไม่ใช่ `main` ใช้ Cloudflare Version command `npx wrangler versions upload` เพื่อสร้างเวอร์ชันทดลองโดยไม่โปรโมต production
4. Production branch คือ `main` และ Deploy command คือ `npx wrangler deploy`
5. ก่อนรวมเข้า `main` ต้องตรวจ test, syntax, UTF-8, no-RIDE และ publication contract ให้ผ่านทั้งหมด
6. Worker เป้าหมายต้องเป็น `normalpocket` เท่านั้น

ห้ามชี้ NormalPocket ไปทับ Worker ของระบบอ้างอิงอื่น

## ถ้าอัปไฟล์ด้วยวิธีอื่น

1. แตกไฟล์ที่ root ของ repo `standard-`
2. คงชื่อไฟล์และ Path เดิม
3. ถ้ามีไฟล์ชื่อซ้ำ ให้แทนที่ของเดิม
4. รัน `npm run deploy:gate`
5. ต้องให้ test, syntax, UTF-8, no-RIDE และ publication contract ผ่านก่อน Deploy
6. Deploy ไปที่ Worker `normalpocket`

หลัง Deploy ให้เปิดแอปออนไลน์หนึ่งครั้งเพื่อให้ Service Worker เห็นชุดไฟล์ใหม่ แล้วตรวจการเปิดใหม่และการใช้งานออฟไลน์
