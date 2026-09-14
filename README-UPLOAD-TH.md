# GO Hub manual upload pack

อัปโหลดเข้า branch: `go-hub-github-gateway-v2` ของ repo `pureekangraw-ops/standard-`
อย่าอัปโหลดเข้า main ตรง ๆ ตอนนี้

ไฟล์ที่ต้องลง:
- `go-hub-worker.mjs` -> root
- `wrangler.go-hub.jsonc` -> root
- `.assetsignore` -> แทนไฟล์เดิม
- `.github/workflows/go-hub-deploy.yml` -> path ตามนี้

Secret ที่มีแล้ว:
- CLOUDFLARE_API_TOKEN
- CLOUDFLARE_ACCOUNT_ID

Secret ที่ยังไม่จำเป็นสำหรับ deploy รอบแรก:
- GOHUB_GITHUB_TOKEN

ถ้ายังไม่มี GOHUB_GITHUB_TOKEN ตัว Worker จะ deploy ได้แต่ gateway จะตอบ 503 GITHUB_NOT_CONFIGURED แบบ fail-closed

หลังอัปโหลดเสร็จ บอกโกว่า `ลงแล้ว`
