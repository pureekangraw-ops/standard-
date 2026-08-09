# YGPH STANDARD

ฐานแอปส่วนตัวที่แยกมาจาก YGPH METROPOLIS 4.2.4 (source commit `7329448eef685d72364c42f8d0373483e6e303d0`) และคงเฉพาะ Store, Ledger, Calendar, Reports/History, Settings, Vault และ Import/Export.

- Product version: **1.0.0**
- Fresh install starts with an empty encrypted Vault.
- ไม่ได้บรรจุข้อมูลส่วนตัวหรือ Vault จาก METROPOLIS.
- Worker/cache identity แยกเป็น `ygph-standard`.

ตรวจแพ็กก่อน deploy: `npm run deploy:gate`
