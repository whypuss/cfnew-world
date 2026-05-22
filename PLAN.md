# cfnew-plus 下一版架構規劃

**版本定位：從 GitHub 玩具 → 長期穩定商用架構**

**核心理念：不是更重混淆，而是「自我修復的高質量節點系統」**

---

## 背景：已完成的清理工作

| 項目 | 狀態 |
|------|------|
| 白色暖色調 UI | ✅ 完成 |
| 移除 Matrix/FX/HUD 動畫 | ✅ 完成 |
| 隱藏訂閱 URL | ✅ 完成 |
| dev 分支建立 | ✅ 完成 |
| 上游同步（v2.9.8） | ✅ 完成 |

---

## 方向升級：用戶反饋

> 不要再追求「超重混淆」。Cloudflare Worker 跟傳統 Node Server 不一樣：
> - CPU 有限制
> - startup time 很重要
> - isolate reuse 很重要
> - bundle size 會直接影響 cold start
>
> Worker 世界，「輕混淆 + 結構隱藏」比「暴力混淆」重要。
>
> 很多人還停留在 2022 年的 Node.js obfuscation 思維。

---

## 核心目標

```
不是：更重混淆
而是：自我修復的高質量節點系統
```

---

## 核心理念轉變：真正的敵人不是「人」，是「機器」

```
優化方向要從：
  「防人看懂」  →  「降低被機器分類」

這是兩個完全不同的世界。
```

### 舊思維 vs 新思維

| 維度 | 舊思維 | 新思維 |
|------|--------|--------|
| 目標 | 防 reverse engineer 看懂代碼 | 降低指紋一致性，避免被聚類 |
| 對象 | 個別分析者 | CF 自動化風控系統 |
| 手段 | 超重混淆 | 多態架構 + 特徵隨機化 |
| 假想敵 | 人 | 機器學習指紋聚類 |

### CF 真正在抓的不是「代理」

而是：

> 「這像不像濫用基礎設施」

例如：
- 高 websocket ratio
- 高 egress
- 高失敗率
- 大量相同指紋的 worker
- 異常 request pattern
- 無正常網頁流量

**只要讓 CF 覺得「這不像大規模濫用模板」，存活率就會高很多。**

---

## 一、混淆策略重構

### 舊思維（已放棄）

- `deadCodeInjection` → -2% 體積，零混淆提升
- `controlFlowFlattening` → +21% 體積，CPU 開銷大
- `selfDefending` → Worker 環境不格式化代碼，永不觸發

**結論：這些全部放棄。**

### 新思維：特徵一致性才是真正的敵人

現在所有 cf proxy 出來都長一樣：

```
/sub              ← 一樣
/clash            ← 一樣
/bestip           ← 一樣
X-Real-IP         ← 一樣
Upgrade: websocket ← 一樣
server: cloudflare ← 一樣
```

CF 很容易做指紋聚類，一抓一批。

### A. Build-time Polymorphism（最重要）

每次 build 隨機化，降低指紋一致性：

#### Route 隨機

```
不要：
  /sub
  /clash
  /bestip
  /api/nodes

改為（每次 build 隨機選一組）：
  /a7f        /n2p        /api/v2r
  /nodes      /cache      /panel
  /sub        /feed       /raw
```

甚至每次 deploy 都不一樣。

#### Header Key 隨機

```
不要：
  X-Real-IP
  X-Proxy-IP
  CF-Connecting-IP

改為（build 時生成）：
  x-a1        x-k2        cf-a
  X-Req-ID    X-Session    X-Token
```

#### Function / Enum / Constant name shuffle

build 時全局替換：

```
vless    → vA    clash   → c1
trojan   → tB    base64  → b64
uuid     → uID   WS      → Ws
```

#### Response Key 隨機

```
不要（全部長一樣）：
  { "ip": "...", "port": 443, "region": "JP" }

改為（build 時隨機）：
  { "addr": "...", "p": 443, "r": "JP" }
  { "ip": "...", "pt": 443, "loc": "JP" }
  { "node": "...", "port": 443 }    // 去掉 region
```

### B. 讓 Worker 像正常網站

現在大量 proxy worker 很像 bot infra：

```
永遠只回純文本   ← bot 行為
永遠 404         ← 不像正常站
永遠 websocket    ← 高風險 pattern
```

**應該有正常網站元素：**

```
✅ 正常首頁（HTML blog / docs / 靜態頁面）
✅ 正常 static assets（favicon、css、js）
✅ 正常 HTTP 回應（cache-control、etag、content-type 多樣化）
✅ robots.txt
✅ 正常 200/404/500 混合回應
```

具體做法（見架構總圖 Layer 1）：

```
Layer 1（正常站）：
  GET /              → 正常 HTML 首頁
  GET /robots.txt    → 正常 robots
  GET /favicon.ico   → 正常 ico
  GET /static/*      → 靜態資源

Layer 2（隱藏入口）：
  GET /${random-hash} → proxy handler
  WebSocket 升級     → 代理協議
```

### C. 降低 WebSocket 比例

WS 比例太高是 CF 風控的重點信號：

```
風險信號：
  100% websocket 流量
  高頻長連接
  高 egress

應對：
  ✅ Subscription cache（減少動態生成）
  ✅ 靜態回應優先
  ✅ 減少 runtime compute
```

### D. 每人獨立 Config（終極方案）

同一 worker 被幾千人用 = 指紋完全一致 = 最容易被聚類。

```
理想架構：
  每人用不同 route     → /${uuid}
  每人用不同 ws path   → /${random-path}
  每人用不同 fake host → ${custom-domain}

這樣即使代碼相同，行為指紋完全不同。
```

**行動**：
- [ ] `build/build.js` 实现 route mapping 隨機化（每次 build 生成不同的 route 映射表）
- [ ] `build/build.js` 实现 enum/constant name 隨機化（build 時全局替換關鍵字符串）
- [ ] `build/build.js` 实现 response key 隨機化（JSON field name 隨機）
- [ ] `build/build.js` 实现 header key 隨機化（X-Real-IP 等替換）
- [ ] Worker 增加正常首頁 `/`（static HTML，不只是終端 UI）
- [ ] 增加 `robots.txt`、`favicon.ico` 等正常站點元素
- [ ] 实现雙層入口（Layer 1 正常站、Layer 2 隱藏 proxy 入口）

### 舊思維（已放棄）

- `deadCodeInjection` → -2% 體積，零混淆提升
- `controlFlowFlattening` → +21% 體積，CPU 開銷大
- `selfDefending` → Worker 環境不格式化代碼，永不觸發

**結論：這些全部放棄。**

### 新思維：真正有效的隱藏

#### A. 指紋分散化（最有價值）

現在所有 cfnew 部署出來，**代碼指紋完全一致**：
- 所有人 `/api/preferred-ips` 都長一樣
- 所有人的 `generateLinks` 函數名相同
- 所有人的 route mapping 一樣

CF 很容易做指紋聚類（fingerprint clustering），一抓一批。

**每次 Build 時隨機化：**

```
route 名隨機：
  /api/preferred-ips  →  /a7f/ip
  /api/nodes          →  /v1/cache
  /sub                →  /panel/nodes

query key 隨機：
  target=base64       →  t=b64
  wk=US              →  w=US

header key 隨機：
  Content-Type        →  X-Ctf
  Authorization       →  X-Auth-Token

internal enum 隨機：
  'base64'           →  'b64'
  'vless'            →  'vl'
  'trojan'           →  'tj'
```

**這比任何 obfuscator 選項有效 100 倍。**

#### B. 結構拆分（比混淆重要）

現在大部分 cf proxy：
- 一個超大 `worker.js`（300KB+）
- regex 一堆
- 關鍵字集中
- 特徵化嚴重

**應該拆成模組：**

```
src/
  config-layer.js      → KV 配置讀寫、开关闭控制
  protocol-layer.js    → VLESS/Trojan/XHTTP 協議處理
  subscription-layer.js → 訂閱生成、格式轉換
  parser-layer.js      → IP 解析、域名解析、CSV 解析
  health-layer.js      → 節點評分、信譽系統
  router.js            → 統一路由分發（所有隨機 route 在這裡）

build/
  build.js             → 隨機化 build script
  obfuscate.js         → 混淆
```

**Build 時：**
- 隨機 import 順序
- 隨機 function name（mangled-shuffled 已有）
- 隨機 route mapping（build script 生成隨機 mapping 表）

#### C. 輕量混淆配置（最終共識）

```js
{
  // 有效
  stringArray: true,                    // 字符串進數組
  stringArrayEncoding: ['base64'],       // base64 編碼
  stringArrayThreshold: 1.0,             // 100% 字符串編碼
  splitStrings: true,
  splitStringsChunkLength: 1,            // 每字節一分塊
  renameGlobals: true,
  identifierNamesGenerator: 'mangled-shuffled',
  disableConsoleOutput: true,
  unicodeEscapeSequence: true,

  // 放棄
  controlFlowFlattening: false,           // ❌ CPU 開銷大
  deadCodeInjection: false,               // ❌ 性價比為零
  selfDefending: false,                  // ❌ Worker 環境白費
  debugProtection: false,                // ❌ 干擾自己
  numbersToExpressions: false,           // ❌ 徒增體積
  forceCompact: false,                   // ❌ 已有 compact
  simplify: false,                       // ❌ 不簡化
  transformObjectKeys: false             // ❌ 無意義
}
```

**行動**：
- [ ] 設計 `src/` 目錄結構，拆分四層
- [ ] 寫 `build/build.js`：每次 build 隨機化 route mapping、enum、header key
- [ ] 更新 `obfuscate.js` 使用輕量配置
- [ ] 測量 build 後體積 vs cold start 時間

---

## 二、節點信譽系統（建議 2）

### 舊方案：關閉爛節點源

只是止血，不解決問題。

### 新方案：建立節點評分系統

讓 cfnew 從「玩具」變成「半商業級」。

#### 節點 metadata 結構

每個 IP/域名在 KV 中記錄：

```js
{
  "ip": "1.2.3.4",
  "port": 443,
  "source": "cmliu",          // 來源：cmliu / wetest / direct / user
  "successRate": 0.92,        // 成功率 92%
  "failCount": 3,             // 累計失敗次數
  "latency": 183,             // 最近延遲（ms）
  "lastSuccess": 1712312300,   // 上次成功時間戳
  "lastFail": 1712310000,     // 上次失敗時間戳
  "region": "JP",             // 地區
  "asn": "20473",            // ASN 號（用於去重）
  "ipSubnet": "1.2.3.0/24",  // IP 段（用於去重）
  "quarantine": false          // 是否被隔離
}
```

#### 自動淘汰規則

```js
// 滿足以下任一條件，自動 quarantine：
if (failCount > 5) quarantine()
if (successRate < 0.3) quarantine()
if (lastSuccess < now - 24h) quarantine()   // 24h 無成功
if (latency > 5000) quarantine()            // 延遲超過 5 秒
```

#### 三段式健康檢查（建議 3）

> 不要只測 TCP connect。Clash 顯示 ms 其實只是 TCP SYN 成功。
> TLS 失敗、WS 被 reset、CF timeout、HTTP blocked 都還是垃圾節點。

```
Layer 1: TCP connect        → 網路可達
Layer 2: TLS handshake       → TLS 證書有效
Layer 3: WebSocket upgrade  → 完整協議握手成功

只有三層全部成功，才算 alive。
```

Worker 在後台定期對節點做三段式健康檢查，更新 metadata。

#### 可信來源權重（建議 4）

```
SourceWeight:
  CMLiussss backupIP    → 1.0    （商業服務，有人維護）
  self-collected        → 1.0    （用了一段時間沒問題）
  verified user report  → 0.8    （用戶舉報ok）
  wetest.vip            → 0.2    （經常爛）
  random CDN scrape     → 0.1    （免費域名，基本不靠譜）
```

**最終評分公式：**

```
score = success_rate × source_weight × recency_factor

recency_factor:
  24h 內成功過 → 1.0
  24-48h → 0.5
  48h+ → 0.1
```

#### 訂閱輸出質量優化（建議 5）

> 現在大家一堆節點，90% 垃圾，Clash timeout，用戶體驗超差。

```
限制規則：
  最多輸出 20 個節點
  只保留 success > 80% 的節點
  同 ASN 去重（保留最低延遲）
  同 /24 IP 段去重（保留最低延遲）
  按 score 排序輸出
```

這樣 Clash 體驗會直接飛升。

**行動**：
- [ ] 設計 KV schema：`node:${ip}:${port}` 存儲節點 metadata
- [ ] 實現 `health-layer.js`：三段式健康檢查
- [ ] 實現 quarantine 邏輯
- [ ] 實現 source_weight 評分
- [ ] 在訂閱輸出前過濾：最多 20 節點、success > 80%、去重
- [ ] 後台定期 health check（每 15-30 分鐘）

---

## 三、訂閱預編譯（建議 7）

### 現有問題

每次請求：
1. parse
2. generate
3. convert
4. stringify

CPU 爆炸。用的人越多，Worker 計時器燒得越快。

### 解決方案：KV 預編譯

```
請求流程（優化後）：
  收到訂閱請求
    → 檢查 KV cache（clash-sub / surge-sub / singbox-sub）
    → cache 存在且未過期（15 分鐘）→ 直接返回 cache
    → cache 不存在或過期 → 生成 → 寫入 KV → 返回
```

**預編譯內容：**
- `clash-sub:${uuid}` → YAML 格式訂閱內容
- `surge-sub:${uuid}` → Surge 格式訂閱內容
- `singbox-sub:${uuid}` → Sing-box 格式訂閱內容
- `meta-sub:${uuid}` → 統一 metadata

**更新觸發：**
- 定期（15 分鐘）
- 用戶手動請求 `/refresh`
- 後台健康檢查後自動更新

**行動**：
- [ ] 實現 `subscription-layer.js`：generate + cache
- [ ] KV write with TTL（15 分鐘）
- [ ] 實現 `/refresh` 端點
- [ ] 測量 cache 前後 CPU 使用差異

---

## 四、Cold Start 優化（建議 6）

### 現有問題

Worker cold start 時加載：
- 巨型 regex 數組
- Giant arrays
- JSON.parse 大量資料
- 巨型 config object

### 解決方案：Lazy Load

```
現在：
  const allIPs = [...]
  const bigRegex = [...]
  在模組頂部全部初始化

改為：
  if (needIPs) { loadIPs() }
  if (needRegex) { loadRegex() }
  按需加載，不用不解釋
```

**Bundle 拆分策略：**
- 主 worker.js：路由、協議處理、KV 讀寫（每次必加載）
- 動態 import：parser、health check、subscription generate（按需加載）

**行動**：
- [ ] 測量現在的 cold start 時間（`wrangler dev` 或實際部署）
- [ ] 識別加載瓶頸（giant arrays、regex 等）
- [ ] 實現 lazy load
- [ ] 測量優化後 cold start 時間

---

## 五、WASM 方向（建議 8）

### 為什麼值得

- 特徵更難抓（JS signature 大幅減少）
- CPU 有時更穩
- 可做 binary transform
- base64 / yaml transform / uri encode 適合放 WASM

### 實現風險

- Workers WASM 支持需要額外工具鏈
- 調試困難
- 兼容性需要測試

### 優先級

**低**。等前面幾項完成後再考慮。

---

## 六、架構總圖

```
src/
├── config-layer.js       # KV 配置讀寫、开关闭
├── protocol-layer.js     # VLESS/Trojan/XHTTP 協議
├── subscription-layer.js # 訂閱生成 + cache（KV 預編譯）
├── parser-layer.js       # IP/域名解析、CSV 解析
├── health-layer.js       # 三段式健康檢查 + 信譽評分
│                          #   - metadata 存 KV
│                          #   - quarantine 邏輯
│                          #   - source_weight 評分
│                          #   - 輸出過濾（20 節點 / 80% / 去重）
└── router.js             # 統一路由 + 指紋隨機化
                          #   - 隨機 route mapping（build 時生成）
                          #   - 隨機 enum mapping（build 時生成）

build/
├── build.js              # 隨機化 build script
│                          #   - 隨機 route 名（每次不同指紋）
│                          #   - 隨機 query key
│                          #   - 隨機 header key
│                          #   - 隨機 enum / constant name
│                          #   - 隨機 JSON response key
│                          #   - 隨機 ws path
│                          #   - 生成指紋映射表注入 worker
└── obfuscate.js           # 輕量混淆（最終配置）

static/                    # 靜態資源（讓 Worker 像正常站）
├── index.html            # 正常首頁（blog / docs / 誘導頁）
├── robots.txt
└── favicon.ico

wrangler.toml
worker.js                  # build 輸出（最終部署文件）

================================================================
雙層入口架構：
================================================================
Layer 1（正常站 — 對外暴露）：
  GET /              → static/index.html（正常首頁）
  GET /robots.txt    → static/robots.txt
  GET /favicon.ico   → static/favicon.ico
  GET /static/*      → 靜態資源
  其他 GET           → 200 OK（隨機 content-type）

Layer 2（隱藏入口 — 真正功能）：
  GET /{random-hash}     → 訂閱下發入口（build 時 random 生成）
  GET /{random-hash}/sub → 訂閱轉換
  WebSocket 升級         → 代理協議（走 /{random-path}）

================================================================
每次 Build 的隨機化內容（build.js）：
================================================================
指紋映射表（隨機生成，寫入 worker）：
  route mapping:
    "/sub"       → "/{random1}"
    "/clash"     → "/{random2}"
    "/bestip"    → "/{random3}"
    "/api/nodes" → "/{random4}"

  enum mapping:
    "vless"  → "{r1}"   # 單字符隨機
    "trojan" → "{r2}"
    "clash"  → "{r3}"
    "base64" → "{r4}"

  header mapping:
    "X-Real-IP"       → "{h1}"
    "CF-Connecting-IP" → "{h2}"

  response key mapping:
    "ip"     → "{k1}"
    "port"   → "{k2}"
    "region" → "{k3}"
```

---

## 七、優先級行動清單

### P0（最高優先 — 降低被聚類風險）

> 這些是真正有效提高存活率的改動，比任何混淆選項都重要。

- [ ] `build/build.js`：實現 route 隨機化（每次 build 生成不同 route mapping）
- [ ] `build/build.js`：實現 enum / constant name 隨機化（build 時全局替換 vless/clash/trojan 等關鍵字符串）
- [ ] `build/build.js`：實現 response key 隨機化（JSON field name 每次不同）
- [ ] `build/build.js`：實現 header key 隨機化（X-Real-IP 等替換）
- [ ] Worker 增加 static/ 目錄（正常首頁、robots.txt、favicon）
- [ ] 實現雙層入口（Layer 1 正常站、Layer 2 隱藏 proxy）

### P1（重要 — 提升節點質量）

- [ ] `health-layer.js`：三段式健康檢查（TCP → TLS → WS 三層）
- [ ] `health-layer.js`：metadata KV schema
- [ ] `health-layer.js`：quarantine 邏輯 + source_weight 評分
- [ ] 訂閱輸出過濾（最多 20 節點、success > 80%、去重）
- [ ] KV 預編譯 cache（15 分鐘 TTL）
- [ ] `obfuscate.js`：輕量配置更新（移除死碼/平坦化/selfDefending）

### P2（可選）

- [ ] 結構拆分（src/ 四層模組）
- [ ] `/refresh` 端點
- [ ] cold start 測量 + lazy load 優化
- [ ] 同 ASN/IP 段去重邏輯

### P3（未來方向）

- [ ] WASM 化
- [ ] 用戶上報節點質量 API
- [ ] 分布式節點數據共享

---

## 八、終極結論

```
真正的敵人：CF 自動化風控特徵系統（不是人）

真正有效的防禦：
  ✅ 指紋分散化（每次 build route/enum/header/response key 隨機）
  ✅ 雙層架構（正常站 + 隱藏 proxy 入口）
  ✅ 靜態資源（讓 Worker 像正常網站）
  ✅ 節點信譽系統（高質量輸出，降低失敗率）
  ✅ KV 預編譯（降低動態計算比例）

不是：
  ❌ 超重混淆（deadCodeInjection / controlFlowFlattening）
  ❌ selfDefending
  ❌ debugProtection
  ❌ 把代碼壓成火星文

核心目標：
  「這不像大規模濫用模板」
  CF 這麼想的話，存活率就高很多。
```

---

*計劃更新時間：2026-05-22*
*整合用戶高階反饋：從「清理」升級為「多態商用架構」*
