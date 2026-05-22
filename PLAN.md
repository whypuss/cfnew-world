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
| 白色暖色調 UI | ✅ 完成 |
| 移除 Matrix/FX/HUD 動畫 | ✅ 完成 |
| 隱藏訂閱 URL | ✅ 完成 |
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

---

## P2：流量正常化 + 降特徵（最高優先）

> **現在立竿見影的收益，比 Pages + Worker 拆分更重要。**

---

### P2-1：流量正常化（超高收益）

#### A. 正常首頁行為

現在已有 `static/`。補足標配：

```
/sitemap.xml          → 正常 XML sitemap
/manifest.json         → PWA manifest
/browserconfig.xml     → Windows tile 配置
/api/posts             → 假博客 JSON（[{id,title,date}...]）
/api/status            → 假系統狀態 JSON（{version,uptime,users}）
```

這些 endpoint 只在 `/welcome` 隨機入口下暴露，不影響主要 proxy 功能。

#### B. cache-control 隨機化

```
現在（太固定）：
  cache-control: no-store          ← 太像 API

改為混合：
  cache-control: public, max-age=3600
  cache-control: public, max-age=7200
  cache-control: public, max-age=300, stale-while-revalidate=600
  cache-control: no-cache
```

subscription response 維持 `no-store`，但 static assets 和 200 回應隨機化。

#### C. 正常 HTML metadata

UI 頁面（`/uuid`）增加：

```html
<meta property="og:title" content="Subscription Manager">
<meta property="og:description" content="...">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
<link rel="canonical" href="https://...">
```

正常網站標配，bot infra 不會做這些。

#### D. Subscription MIME 多態

```
現在（太固定）：
  Content-Type: text/plain        ← 100% 訂閱都是這樣

改為依 client 決定：
  text/plain                      → curl / direct fetch
  application/json                → JS fetch (Accept: application/json)
  application/octet-stream        → 部分 client
  text/yaml                       → 極少見，正常網站特徵
```

---

### P2-2：Proxy 流量降特徵

#### A. Route alias pool

`build.js` 生成時不只是 `/sub` → `/knlg`，而是：

```
/sub  →  /knlg 或 /x1 或 /live 或 /connect 或 /api/data（隨機選）
/?ed=2048  →  /stream?ed=2048 或 /live?ed=2048 或 /connect?ed=2048（隨機選）
```

讓每個 deploy 的 route pattern 不完全一致。

#### B. Query param polymorphism

```
現在（太固定）：
  ?token=xxx
  ?target=clash

改為（build 時隨機）：
  ?token=xxx    →  ?k=xxx  或  ?v=xxx  或  ?auth=xxx
  ?target=clash →  ?f=clash  或  ?fmt=clash  或  ?out=clash
```

#### C. Subscription MIME 隨機化（已在 P2-1-D）

---

### P2-3：行為節流（超重要）

#### A. Subscription rate limit

```
同 IP:
  30 秒內只能刷新一次訂閱
  超出 → 返回 429 + Retry-After: 30
```

用 KV 記錄 `ratelimit:{ip}` 時間戳。

#### B. WebSocket connect backoff

```
現在：Clash 不斷重連 → reconnect storm → 觸發風控

改為：
  首次失敗 → 等 5 秒再試
  二次失敗 → 等 15 秒
  三次失敗 → 等 60 秒（quarantine）

避免短時間大量連接失敗。
```

#### C. Fail fast

```
現在：垃圾 IP → timeout 15 秒 → 然後才放棄

改為：
  TCP connect timeout: 3 秒（不要 15 秒）
  TLS timeout: 5 秒
  失敗直接標記 quarantine，不要 hang 著浪費時間
```

---

### P2-4：出站分散

#### A. 隨機優先 source

```
現在（固定）：
  CMLiussss → 優先用

改為（weighted shuffle）：
  所有 source 混合，隨機打亂順序
  避免每次都先用同一批 IP
```

#### B. ASN 去重（已在 P1 完成）

同 ASN 保留最低延遲的一個。

#### C. Region diversify

```
現在：可能集中某一地區

改為：
  最多 3 個同 Region
  強制跨 Region 分散（JP/KR/SG/US 混）
```

---

### P2-5：Worker fingerprint diversification

`build.js` 再升級：

#### A. Fake static assets 注入

```
正常網站都有：
  /assets/app.a1.js
  /assets/main.css

即使這些是假資源（返回空或 204），
也讓指紋更像正常網站。

每次 build 注入不同的 fake asset paths。
```

#### B. Random response headers

```
每次 build 隨機生成一組假的 server headers：
  x-build: a7f2
  x-edge: k91
  x-runtime: 12ms
  server-timing: IntId;desc="cold-start"

這些是正常 CDN/框架會帶的 header，
讓指紋更像常見架構。
```

---

## P3：Pages + Worker（未來方向）

方案 A（推薦）：
```
Cloudflare Pages（正常網站層）：
  /                    → HTML 首頁
  /docs                → 文檔頁面
  /sitemap.xml         → 站點地圖

Worker（隱藏入口層）：
  /api/{random-hash}   → 訂閱入口
  /ws/{random-hash}    → WebSocket 代理
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

### P2（現在開始）

#### P2-1：流量正常化
- [ ] sitemap.xml、manifest.json、browserconfig.xml
- [ ] /api/posts、/api/status 假 JSON endpoints
- [ ] cache-control 隨機化（static assets / 200 responses）
- [ ] HTML metadata（og tags、twitter cards、canonical）
- [ ] Subscription MIME 多態（依 Accept header）

#### P2-2：Proxy 流量降特徵
- [ ] Route alias pool（build.js 升級）
- [ ] Query param polymorphism（build.js 升級）
- [ ] Subscription MIME 多態

#### P2-3：行為節流
- [ ] Subscription rate limit（同 IP 30 秒一次）
- [ ] WebSocket connect backoff
- [ ] Fail fast（TCP 3s timeout，直接 quarantine）

#### P2-4：出站分散
- [ ] 隨機優先 source（weighted shuffle）
- [ ] Region diversify（最多 3 同 Region）

#### P2-5：指紋多態化
- [ ] build.js 升級：fake static assets 注入
- [ ] build.js 升級：random response headers

### P3（未來方向）

- [ ] Pages + Worker 拆分
- [ ] 結構拆分（src/ 四層模組）
- [ ] WASM 化

---

## 架構總圖

```
Layer 1（靜態 / 正常站）：
  GET /welcome           → static/index.html
  GET /robots.txt        → static/robots.txt
  GET /favicon.ico       → static/favicon.ico
  GET /sitemap.xml      → 生成 XML
  GET /manifest.json     → 生成 JSON
  GET /api/posts         → 生成假博客 JSON
  GET /api/status        → 生成假狀態 JSON

Layer 2（隱藏入口）：
  GET /{uuid}            → 訂閱中心 UI
  GET /{uuid}/{sub}      → 訂閱內容（隨機 route）
  WS  /{uuid}/{ws}       → WebSocket 代理（隨機 path）
  GET /{uuid}/refresh    → 清除 cache

每次 Build 隨機化（build.js）：
  • Route names (/sub → /knlg)
  • Query params (?target= → ?f=)
  • Header keys (X-Real-IP → cfx-rh)
  • Response keys (ip → a)
  • Enum names (vless → ft)
  • WS path (?ed=2048 → /stream?ed=2048)
  • Cache-Control 值（max-age=3600/7200/300）
  • MIME types（text/plain / application/json / octet-stream）
  • Fake response headers (x-build, x-edge)
  • Fake static asset paths
```

---

*計劃更新時間：2026-05-22*
*整合用戶 P2 反饋：流量正常化 + 降特徵化優先於結構拆分*
