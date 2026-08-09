# STANDARD Upload Guide

1. แตก ZIP ที่ root ของ repo `standard-`.
2. อัปโหลดไฟล์ทั้งหมดโดยคงชื่อเดิม.
3. ถ้ามีไฟล์เก่าใน repo ที่ชื่อซ้ำ ให้ overwrite.
4. รัน `npm run deploy:gate` ก่อน deploy.
5. ใช้ Worker ใหม่ชื่อ `ygph-standard`; ห้ามชี้ทับ `ygph-metropolis`.
