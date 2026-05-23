# cfnew-plus 下一版架構規劃

**版本定位：從 GitHub 玩具 → 長期穩定商用架構**

**核心理念：不是更重混淆，而是「anti-fingerprint engineering」—— 降低被機器分類**

---

## 方向共識（2026-05-22 更新）

```
模組化重構 ≠ 立刻降低風控

但下面這些會：
  • 流量正常化
  • polymorphic routes
  • rate limit
  • fail-fast
  • ASN diversify
  • header diversification

收益比拆結構大很多。
```

---

## ⚠️ 工程安全約束（任何人機實作 P2 前必讀）

> **核心原則：寧可少完成 P2 功能，也不能破壞現有 subscription 功能。**
> 穩定性優先於功能完整度。如果某功能可能影響核心路由，允許跳過並留下 TODO。

---

### 1. 禁止全域 regex replace

**禁止**對 `worker.js` 做全域 `replace(/xxx/g, ...)` 或 `replaceAll()`。

所有 route/query/header polymorphism 必須：
- 集中在 `build.js` 的 registry 注入
- 只替換明確的 placeholder（如 `ROUTE_ALIAS`、`TOKEN_PARAM`、`TARGET_PARAM`）
- 不得修改 runtime 核心邏輯字串

---

### 2. route dispatch 順序限制

路由優先級必須嚴格保持（從高到低）：

1. `/uuid/secret routes`（最高優先）
2. WebSocket upgrade routes
3. Subscription routes（`/uuid/{sub}`）
4. `/refresh` endpoint
5. Fake API routes（`/api/...`）
6. Fake static assets（`/assets/...`、`/sitemap.xml` 等）
7. Normal static pages（最低，`/robots.txt`、`/favicon.ico`）

**禁止**新增 catch-all route（如 `pathname.startsWith('/')` 寬泛判斷）。
**禁止**在 route dispatch 中使用 `else if` 鏈式吞噬。

---

### 3. Subscription MIME polymorphism 保守限制

Subscription MIME 多態必須保守實作：

- 已識別代理客戶端（Clash / Sing-box / Surge / Stash）→ 維持原 `Content-Type`
- `curl` / `wget` → `text/plain`
- Browser UA → `text/yaml`
- `Accept: application/json` → `application/json`
- 未知情況 → 維持現有 MIME（**不要改**）

**禁止**影響 base64 subscription 輸出內容和編碼邏輯。

---

### 4. Rate limit 排除健康檢查

Rate limit 只作用於**外部 subscription refresh requests**。

**不得作用於**：
- Internal health checks
- KV refresh jobs
- `/refresh` endpoint
- Fake API routes

---

### 5. Fail-fast timeout 配置限制

- TCP connect timeout → `3-5 秒`（可配置 `const CONNECT_TIMEOUT_MS = 4000`）
- WebSocket upgrade timeout → **不要修改**
- Timeout 必須可配置，禁止 hardcode 到所有 fetch/socket 操作

---

### 6. Source shuffle 演算法限制

**禁止**使用 `array.sort(() => Math.random() - 0.5)`（不公平且分佈差）。

必須：
- 使用 weighted shuffle（Fisher-Yates 或 similar）
- 同 source 不得連續超過 `MAX_NODES_PER_SOURCE` 個
- 保持 `successRate` 排序優先級
- `quarantine` nodes **永不**參與 shuffle

---

### 7. Fake static assets 數量限制

- 固定 3-5 個路徑，build 時生成但 deploy 後穩定
- 返回空內容或極小 JS/CSS（< 1KB）
- **禁止**每 request 動態生成 fake assets
- 總數不得超過 5 個

---

### 8. 絕對禁止修改的核心流程

**禁止修改**以下任何一個環節：

- UUID 驗證邏輯
- Subscription encode / decode pipeline
- Base64 處理邏輯
- WebSocket stream handling
- KV cache schema
- Health scoring / quarantine algorithm
- `generateLinks()` 核心輸出格式

除非任務明確要求且已理解完整影響。

---

### 9. Deploy 驗證清單

每次 deploy 完成後**必須**驗證以下所有項目。任何核心路由失敗 → **停止並回滾**：

```
✅ /{uuid}/{sub}     → 200 + valid base64 content
✅ /{uuid}/refresh   → 200
✅ WebSocket route   → 101 Switching Protocols
✅ /robots.txt       → 200
✅ /sitemap.xml      → 200 + valid XML
✅ Fake asset path   → 200
✅ Subscription cache hit 不受影響
```

---

## 核心理念：真正的敵人是「機器」，不是「人」

```
優化方向要從：
  「防人看懂」  →  「降低被機器分類」

CF 真正在抓的不是「代理」，
而是：「這像不像濫用基礎設施」

例如：
  - 高 websocket ratio
  - 高 egress
  - 高失敗率
  - 大量相同指紋的 worker
  - 異常 request pattern
  - 無正常網頁流量
  - 永遠 cache-control: no-store
  - 永遠 Content-Type: text/plain

只要讓 CF 覺得「這不像大規模濫用模板」，存活率就高很多。
```

---

## 已完成工作

| 項目 | 狀態 |
|------|------|
| dev 分支建立 | ✅ 完成 |
| 上游同步（v2.9.8） | ✅ 完成 |
| Route 隨機化（build.js） | ✅ 完成 |
| Enum/constant name 隨機化 | ✅ 完成 |
| Response key 隨機化 | ✅ 完成 |
| Header key 隨機化 | ✅ 完成 |
| static/ 靜態網站資源 | ✅ 完成 |
| /refresh 端點 + `?refresh=1` | ✅ 完成 |
| KV 預編譯 cache（15min TTL） | ✅ 完成 |
| 三層健康檢查（TCP→TLS→WS） | ✅ 完成 |
| 節點信譽 + quarantine 系統 | ✅ 完成 |
| 訂閱輸出過濾（20節點/80%/去重） | ✅ 完成 |
| obfuscate.js 輕量配置 | ✅ 完成 |
| 白色暖色調 UI | ✅ 完成 |
| 移除 Matrix/FX/HUD 動畫 | ✅ 完成 |
| 隱藏訂閱 URL | ✅ 完成 |

---

## P2：流量正常化 + 降特徵（最高優先）

> **現在立竿見影的收益，比 Pages + Worker 拆分更重要。**

---

### P2-1：流量正常化（✅ 已完成）

- ✅ `/sitemap.xml` → 正常 XML sitemap
- ✅ `/manifest.json` → PWA manifest
- ✅ `/browserconfig.xml` → Windows tile 配置
- ✅ `/api/posts` → 假博客 JSON
- ✅ `/api/status` → 假系統狀態 JSON
- ✅ `/robots.txt` → 靜態 robots.txt
- ⏸️ cache-control 隨機化（static assets 部分完成，subscription 維持 no-store）
- ⏸️ HTML metadata（og tags、twitter cards）— 延後（UI stable freeze）
- ⏸️ Subscription MIME 多態 — 延後（需保守實作）

---

### P2-2：Proxy 流量降特徵（⚠️ 部分完成）

- ✅ Route alias pool（`/sub` → 多個隨機 aliases）
- ⏸️ Query param polymorphism — 框架存在，未完整測試
- ⏸️ Subscription MIME 多態 — 延後

---

### P2-3：行為節流（⏸️ 延期）

- ⏸️ Subscription rate limit（同 IP 30 秒一次）— 延期
- ⏸️ WebSocket connect backoff — 延期（connect timeout 可配置但 WS backoff 未實現）
- ⏸️ Fail fast（TCP 3s timeout，直接 quarantine）— 延期

---

### P2-4：出站分散（✅ 已完成）

- ✅ Weighted source selection（successRate×0.45 + latencyScore×0.30 + sourceDiversity×0.15 + regionDiversity×0.10）
- ✅ ASN limit（max 2 per ASN，取代完全 dedupe）
- ✅ Region diversify（max 3 per region）
- ✅ Subnet dedup（post-ASN-filter，保留 /24 分散）

---

### P2-5：指紋多態化（✅ 已完成）

- ✅ 4 個 fake static assets（favicon、app.js、main.css、runtime.js）— **freeze at 4，嚴禁增加**
- ✅ Random response headers（x-build、x-edge、x-runtime、server-timing）

---

## Phase Stable：架構穩定化（當前階段）

> **不再追求更多隨機化。目標：consistency、observability、deterministic behavior。**

### Phase Stable-1（✅ 已完成）

#### 1. Git workflow 固化

**禁止** `git add -A`。每次 commit 必須明確指定：

```
git add worker.js build/build.js build/mappings.json PLAN.md .gitignore
```

`.gitignore` 已定義 artifact boundary：

```
# Commit：
#   - source code（worker.js、build.js）
#   - deterministic seed config（ROUTE_SEED_VERSION）
#   - route registry template（mappings.json — persisted manifest）
#   - PLAN.md

# Ignore：
#   - plain.js、obfuscated.js（build 產出）
#   - .wrangler/、node_modules/
#   - worker.js.bak
```

#### 2. Deterministic route seed

```
ROUTE_SEED_VERSION = 1
PROJECT_SEED = 'cfnew-plus-v1'
```

- 所有 `Math.random()` 替換為 `createSeededRng(PROJECT_SEED)`
- 同 seed version → 同 routes（deterministic across rebuilds）
- Rotate routes：手動遞增 `ROUTE_SEED_VERSION`
- **禁止**：timestamp-based seed
- **禁止**：每 commit 自動 randomize

#### 3. Persisted route manifest

`build/mappings.json` 是 **committed artifact**：

```json
{
  "seedVersion": 1,
  "projectSeed": "cfnew-plus-v1",
  "routes": { "/sub": "/syv", "/connect": "/data" },
  "aliases": ["/zakx", "/lyk", "/sxvmu"],
  "fakeAssets": ["/favicon-32-{hash}.png", "/assets/app-{hash}.js", ...]
}
```

#### 4. Route classification（已實作）

Public polymorphic routes（外部 observable attack surface）：
- `/sub` — subscription path（randomized）
- `/connect` — WebSocket path（randomized，取代 `/?ed=2048`）

Internal fixed routes（UI runtime dependencies）：
- `/api/config` — KV storage
- `/api/preferred-ips` — IP lookup
- `/__route_debug` — debug endpoint
- `/refresh` — cache invalidation

**原則**：UI contract routes 永不 randomize，否則 frontend JS 會斷裂。

---

### Phase Stable-2（下一階段）

#### 4. Route tracing layer

```js
GET /__trace?path=/zakx
// → { matched: "sub_alias", source: "ROUTE_ALIASES", dispatch: "hasSubRoute → handleSubscriptionPage" }
```

先提升 observability，再做 centralization refactor。

#### 5. Config source tracing

```json
{
  "cp": { "value": "hcxq", "source": "env" },
  "piu": { "value": "", "source": "default" },
  "fallback": { "value": "...", "source": "kv" }
}
```

來源會越來越多：KV、env、build inject、runtime、defaults。config normalization layer 必須從一開始就做好。

---

### Phase Stable-3（最後）

#### 6. Route registry centralization

統一 `hasSubRoute`、`extractSubAlias`、static path checks 到單一 `ROUTE_REGISTRY` + `matchRoute(type, pathname)`。

**前提**：Phase Stable-2 observability 完善後再做，否則 refactor 引入 shadow mismatch 風險太高。

---

## 架構總圖

```
Layer 1（靜態 / 正常站）：
  GET /robots.txt           → 200 靜態
  GET /sitemap.xml         → 200 生成 XML
  GET /manifest.json       → 200 生成 JSON
  GET /browserconfig.xml    → 200 生成 XML
  GET /api/posts            → 200 假博客 JSON
  GET /api/status           → 200 假狀態 JSON
  GET /__route_debug        → 200 observability endpoint

Layer 2（隱藏入口）：
  GET /{uuid}               → 訂閱中心 UI
  GET /{uuid}/{sub}        → 訂閱內容（隨機 route）
  WS  /{uuid}/{ws}         → WebSocket 代理（隨機 path）
  GET /{uuid}/refresh       → 清除 cache

Layer 3（Blanket 404）：
  所有其他 GET → 404 "Not Found"
  （除非 isCustomSubPath 白名單通過）

每次 Build 隨機化（build.js，ROUTE_SEED_VERSION=1）：
  • Route names (/sub → /knlg)
  • Query params (?target= → ?f=)
  • Header keys (X-Real-IP → cfx-rh)
  • Response keys (ip → a)
  • Enum names (vless → ft)
  • WS path (?ed=2048 → /stream?ed=2048)
  • Cache-Control 值（max-age=3600/7200/300）
  • MIME types（subscription 維持 text/plain）
  • Fake response headers (x-build, x-edge)
  • Fake static asset paths（4個，freeze）
  • Route aliases（3個，seed-stable）
```

---

## 優先級行動清單

### P0（已完成 ✓）

- [x] `build/build.js`：route 隨機化
- [x] `build/build.js`：enum/constant name 隨機化
- [x] `build/build.js`：response key 隨機化
- [x] `build/build.js`：header key 隨機化
- [x] `build/build.js`：browser-side sub path injection
- [x] static/ 目錄（index.html、robots.txt、favicon）
- [x] /refresh 端點 + `?refresh=1` query param

### P1（已完成 ✓）

- [x] KV 預編譯 cache（15min TTL）
- [x] 三段式健康檢查（TCP→TLS→WS）
- [x] 節點信譽 + quarantine 系統
- [x] 訂閱輸出過濾（20節點/80%/去重）
- [x] obfuscate.js 輕量配置

### P2（✅ P2-1/P2-4/P2-5 完成，P2-2 部分，P2-3 延期）

#### P2-1：流量正常化
- [x] sitemap.xml、manifest.json、browserconfig.xml
- [x] /api/posts、/api/status 假 JSON endpoints
- [x] /robots.txt 靜態
- [x] /browserconfig.xml
- [ ] cache-control 隨機化（static assets 部分）
- [ ] HTML metadata（og tags、twitter cards、canonical）
- [ ] Subscription MIME 多態（依 Accept header）

#### P2-2：Proxy 流量降特徵
- [x] Route alias pool（build.js 升級，3 aliases）
- [ ] Query param polymorphism（框架存在，未完整測試）
- [ ] Subscription MIME 多態

#### P2-3：行為節流
- [ ] Subscription rate limit（同 IP 30 秒一次）
- [ ] WebSocket connect backoff
- [ ] Fail fast（TCP 3s timeout，直接 quarantine）

#### P2-4：出站分散
- [x] 隨機優先 source（weighted shuffle）
- [x] ASN limit（max 2 per ASN）
- [x] Region diversify（max 3 per region）
- [x] Subnet dedup（post-ASN-filter）

#### P2-5：指紋多態化
- [x] build.js：fake static assets 注入（**freeze at 4**）
- [x] build.js：random response headers

### Phase Stable-1（✅ 已完成）

- [x] `.gitignore` artifact boundary 定義
- [x] `git add <files>` 固化 workflow
- [x] `ROUTE_SEED_VERSION = 1` + `PROJECT_SEED` in `build.js`
- [x] `createSeededRng()` 取代所有 `Math.random()`
- [x] `build/mappings.json` committed as artifact
- [x] Route classification（public vs internal routes）
- [x] Commit `5633095` made（pending push to origin）

### Phase Stable-2

- [ ] `GET /__trace?path=` route tracing endpoint
- [ ] Config source tracing（`{ value, source }` format）

### Phase Stable-3

- [ ] Route registry centralization（`ROUTE_REGISTRY` + `matchRoute`）
- [ ] Dispatch cleanup

### P3（未來方向）

- [ ] Pages + Worker 拆分
- [ ] 結構拆分（src/ 四層模組）
- [ ] WASM 化

---

## 工程警示

### ⚠️ 過度 polymorphism 的危害

**不要再追求「每次都變」**。過度 polymorphism 會開始傷：

- **cacheability** — cache 失效，edge 效率降低
- **observability** — debug 日誌複雜，root cause 分析困難
- **rollback** — 每次 deploy route 全變，無法快速回滾
- **client stability** — bookmark 失效，client config 爆炸
- **naming consistency** — 大量 alias/route 增加維護成本

### ✅ 生產級 polymorphism 的定義

```
不是：「每次都變」
而是：「有限度、可控、可追蹤的變化」

有限度：固定 pool size（4 fake assets、3 aliases）
可控：ROUTE_SEED_VERSION 控制 rotate 時機
可追蹤：build/mappings.json 是 committed artifact
```

---

## 配置系統工程（2026-05-23 更新）

### Config Precedence（已修復）

```
Priority（高 → 低）：
  1. env.D / env.d        ← routing config 正確的來源（Cloudflare Secret）
  2. env fallback         ← 第二層
  3. KV store             ← 只能用於 cache/health，不可用於 routing config

KV store 絕不能用於覆蓋：
  - sub path (d)
  - ws path (w)
  - uuid path (u)
  - route aliases

KV store 只能用於：
  - node health state
  - reputation scores
  - cache timestamps
  - rate limit counters
```

### Empty-String Poisoning（已修復 ✅）

**根本原因**：KV store 的 `d` key 被設為 empty-string `''`，`getConfigValue` 返回 `''` 被當作有效值，env fallback 無法觸發，導致：
1. Blanket 404 攔截所有 custom sub path（包括 `/hcxq`）
2. Alias routing 被 `firstSeg !== tmpAt` 誤殺

**修復方案**：
1. 刪除 KV `d` key：`npx wrangler kv key delete d --binding C`
2. `getConfigValue` 增加 bypass：key `'d'` 直接跳過 KV
3. Blanket 404 白名單：`isCustomSubPath` 捷徑
4. Alias 白名單：`!isSubAlias` 保護

**防範機制**：
```js
function getConfigValue(key, defaultValue, envRef) {
  const kvVal = await env.CF_KV.get(key);
  // '' and null/undefined are both treated as "missing"
  if (key === 'd') return envRef?.d || envRef?.D || defaultValue; // bypass KV
  if (kvVal !== undefined && kvVal !== null && kvVal !== '') return kvVal;
  return envRef?.[key] || envRef?.[key.toUpperCase()] || defaultValue;
}
```

---

*計劃更新時間：2026-05-23*
*P2 Freeze：P2-1/P2-4/P2-5 ✅ 完成，P2-2 ⚠️ 部分，P2-3 ⏸️ 延期*
*Phase Stable-1 ✅ 完成，Phase Stable-2 下一階段*

---

## 已知問題（待處理）

### 1. Browser saveConfig FAKERESPONSE HEADER（未確認）
- **現象**：用戶瀏覽器保存配置仍顯示 `FAKERESPONSE HEADER` 錯誤
- **Server-side 驗證**：`curl -X POST /api/config` → `{"success":true}` ✅
- **可能原因**：瀏覽器 JS cache 緊舊版（舊版使用 randomized path `/mim/awcg`，新版使用 `/api/config`）
- **解決方案**：Chrome DevTools → Network → **Disable cache** → Ctrl+Shift+R hard refresh
- **狀態**：未確認，需用戶親自測試

### 2. Git Push Pending
- **Commit**：5633095（"fix: P2-0 alias routing + Phase Stable-1 foundations"）
- **Status**：本地，未 push 到 origin
- **解決方案**：`git push origin dev`
