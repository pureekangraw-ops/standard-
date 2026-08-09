# STANDARD Upload Guide

STANDARD ใช้ Worker แยกจาก METROPOLIS และต้องผ่าน gate ก่อน Deploy ทุกครั้ง

## ถ้าทำผ่าน GitHub

1. เปิด Pull Request ตามปกติ
2. รอ `STANDARD Safety Gate` ให้ผ่าน
3. ตอน merge/push เข้า `main` ระบบจะตรวจ gate ซ้ำ
4. GitHub Workflow ตอนนี้ **ตรวจอย่างเดียว ยังไม่ Deploy อัตโนมัติ**
5. เมื่อจะ Deploy ให้ใช้ Worker ชื่อ `normalpocket`

ห้ามชี้ STANDARD ไปทับ Worker ของ METROPOLIS

## ถ้าอัปไฟล์ด้วยวิธีอื่น

1. แตก ZIP ที่ root ของ repo `standard-`
2. คงชื่อไฟล์และ Path เดิม
3. ถ้ามีไฟล์ชื่อซ้ำ ให้แทนที่ของเดิม
4. รัน `npm run deploy:gate`
5. ต้องให้ test, syntax, UTF-8, no-RIDE และ publication contract ผ่านก่อน Deploy
6. Deploy ไปที่ Worker `normalpocket`

หลัง Deploy ให้เปิดแอปออนไลน์หนึ่งครั้งเพื่อให้ Service Worker เห็นชุดไฟล์ใหม่ แล้วค่อยตรวจการเปิดใหม่และการใช้งานออฟไลน์
