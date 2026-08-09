const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=f=>fs.readFileSync(path.join(root,f),"utf8");

test("STANDARD exposes Store Ledger Calendar only",()=>{
  const html=read("index.html");
  assert.match(html,/data-page="store"/);
  assert.match(html,/data-page="ledger"/);
  assert.match(html,/data-page="calendar"/);
  assert.doesNotMatch(html,/data-page="ride"|id="ridePage"|วิ่งงาน/);
});

test("fresh STANDARD state has no ride domain",()=>{
  const app=read("app.js");
  assert.doesNotMatch(app,/state\.ride|value\.ride|migrated\.ride|source === "RIDE"/);
  const core=read("core.js");
  assert.doesNotMatch(core,/state\.ride|ride:/);
});

test("dashboard keeps current-month payable count contract",()=>{
  const previousDirection=global.queueDirection, previousSource=global.findSource, previousBalance=global.currentBalanceSatang;
  global.queueDirection=i=>i.direction||"OTHER";
  global.findSource=()=>({status:"OPEN"});
  global.currentBalanceSatang=()=>0;
  try {
    delete require.cache[require.resolve("../metropolis-r5-4.js")];
    const runtime=require("../metropolis-r5-4.js");
    const m=runtime.r54Metrics({store:{stockQty:0},calendar:[
      {status:"OPEN",direction:"OUT",due:"2026-08-10"},
      {status:"OPEN",direction:"OUT",due:"2026-09-01"}
    ]},"2026-08-09");
    assert.equal(m.pendingOut,1);
  } finally {
    if(previousDirection===undefined) delete global.queueDirection; else global.queueDirection=previousDirection;
    if(previousSource===undefined) delete global.findSource; else global.findSource=previousSource;
    if(previousBalance===undefined) delete global.currentBalanceSatang; else global.currentBalanceSatang=previousBalance;
  }
});

test("STANDARD owns cache and deployment identity",()=>{
  const manifest=JSON.parse(read("manifest.webmanifest"));
  const wrangler=JSON.parse(read("wrangler.jsonc"));
  const sw=require("../sw.js");
  assert.equal(manifest.short_name,"STANDARD");
  assert.equal(wrangler.name,"ygph-standard");
  assert.match(sw.RELEASE_ID,/^v1\.0\.0-20260809-r1-standard-baseline$/);
  assert.doesNotMatch(sw.APP_CACHE_PREFIX,/metropolis/i);
});

test("all local JS/CSS assets referenced by index exist",()=>{
  const html=read("index.html");
  const refs=[...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(match=>match[1]);
  assert.ok(refs.length>0);
  for(const ref of refs) assert.equal(fs.existsSync(path.join(root,ref)),true,`missing local asset: ${ref}`);
  assert.doesNotMatch(html,/flow-era-3\.5/);
});

test("STANDARD uses an isolated product and Vault identity",()=>{
  const app=read("app.js");
  const core=read("core.js");
  const v4=read("metropolis-v4.js");
  const r51=read("metropolis-r5-1.js");
  const r52=read("metropolis-r5-2.js");
  assert.match(app,/DB_NAME = "ygph-standard-secure"/);
  assert.match(core,/DB_NAME = 'ygph-standard-secure'/);
  assert.match(v4,/const METROPOLIS_NAME = "YGPH STANDARD"/);
  assert.match(v4,/STANDARD v\$\{METROPOLIS_VERSION\}/);
  assert.match(r51,/YGPH STANDARD/);
  assert.match(r52,/YGPH STANDARD/);
  assert.doesNotMatch([v4,r51,r52].join("\n"),/Four Apps|• 4 แอป|YGPH METROPOLIS v/);
});
