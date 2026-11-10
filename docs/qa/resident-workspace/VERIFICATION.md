# 居民工作台驗收紀錄

日期：2026-11-10。分支：`codex/resident-workspace`。修改留在本地，未部署。

## 自動檢查

| 檢查 | 結果 |
| --- | --- |
| TypeScript / ESLint | 通過 |
| Vitest | 22 個檔案、80 個測試通過 |
| Playwright Chromium | 65 個通過；1 個桌面專案的觸控專用測試跳過，同一測試在手機專案通過 |
| Next.js production build | 通過，包含 `/api/v1/traffic/news` |
| docs:check | 5 個必要文件、11 個來源通過 |
| GLB 檢查 | 五個自包含 GLB，每個小於 400KB、最多 12 個 material primitives |

e2e mock 公開 API、OpenFreeMap style 及 HLS。覆蓋單一工作台、五個主入口、鍵盤導航、收藏重新載入、方向及站點、停站優先、車種、附近定位、錯誤與重試、AI 首頁問題及答案依據、AI 失敗、舊輕軌公告摺疊、3D 延後載入、模型失敗回退、夜間路況語意色及輕軌獨立地圖。320／768／1440px 沒有頁面水平溢出，主導航觸控範圍至少 44px。手機專案用實際 touchStart/touchMove/touchEnd 驗證滑動不會誤選路線。

新增幾何測試驗證亂序軌道能從兩端接駁、不把不相連片段畫成捷徑；fallback 的各線站點到其軌道小於 5m。兩節車廂在彎道有各自方向，在終點不越出路線。這些驗證資料與程式內部一致性，不代表官方測繪精度。

## 視覺與本機檢查

用實際瀏覽器檢查桌面及 390×844 手機尺寸的首頁、候車、列表／地圖、日夜配色、輕軌站及車廂模型。介面已換 Noto Sans TC；常用、附近、天氣、候車及來源狀態用獨立卡片。截圖位於本目錄。3D 主入口圖像由同一 Blender 模型渲染，沒有另外啟動首頁 WebGL 動畫。

模型按使用者更正，統一採固定 4 倍世界比例。縮放只改變鏡頭，不再按像素自動補償模型大小；車廂間距亦固定。圓角分段、圓筒、輪胎及法線已細化，增加輪轂螺栓、頂部通風紋理和接觸陰影，配色提高飽和度與明暗對比。列車 GLB 從 z12 可見，其他模型從 z14 可見。重疊地標會省略模型並保留平面點，已選站優先。總模型大小 962,612 bytes，沒有遠端貼圖依賴。沒有量測實機 FPS 或電池消耗。

## 清晰度及過渡量度

安裝版本 MapLibre 6 的 context 預設 `antialias: false`。Three.js 使用已存在的 context，之後設定 `antialias: true` 不會重新建立畫布。現在於 MapLibre 建立畫布時請求抗鋸齒。測試瀏覽器實際回報 antialias 開啟、4 samples；裝置是否提供 MSAA 由瀏覽器／GPU 決定。

同一台 Mac、同一份 API／地圖 style fixtures，單 worker 先讓相機和 shader 穩定兩秒，再計三秒內 `drawElements`／`drawArrays` 呼叫。期間巴士仍每兩秒輪詢，官方位置固定。結果見 `map-performance.json`：

| 情境 | 修改前 draw calls | 修改後 draw calls | 畫布／CSS 像素 |
| --- | ---: | ---: | --- |
| 桌面 Chromium | 4,000 | 64 | 832×644／832×644，DPR 1 |
| 模擬手機 Chromium | 1,984 | 64 | 1170×1608／390×536，DPR 3 |

原本畫布已有裝置原生解像度，沒有把低解像度畫面當作根因，也沒有盲目提高 DPR。修正為巴士到達官方目標後停止 RAF，收到新位置再移動；隱藏分頁亦停止循環。測試會再送新位置，驗證移動恢復。並行完整套件可能因輪詢時點多一幀，回歸預算為三秒內少於 200 次。這是繪圖工作量，不能轉述為 FPS 或 INP。

卡片過渡只在 `#workspace-content` 子樹執行。測試記錄到原生 shared-card pseudo-element 動畫，時間不超過 280ms，沒有 document-wide transition。驗證路線卡進入與返回、焦點、快速鍵盤導航，以及導航和舊卡片交錯點擊。手機切換時，離場的控制即時 inert 並離開 accessibility tree，焦點交到進場畫面；改回桌面尺寸後兩邊可操作。實際手機尺寸長清單檢查：在 scrollTop 844 選路線 50，返回後仍為 844，焦點在原路線卡。沒有 scoped API 時使用 220ms 進場；減少動態時內容沒有動畫。這些 Chromium 模擬測試不等同 Safari 或實體觸控裝置驗收。

## 外部限制

- 本機沒有 `ASSISTANT_API_KEY`。使用者選擇沿用 DeepSeek；供應商預設保留。首頁到答案流程以 fixture 驗證，真正的 DeepSeek 回答尚未驗證。實際按下問題時，服務返回未配置；前端清楚顯示無法產生答案。
- 刻意執行 `verify:sources` 的整體結果為失敗：DSAT 泊車及舊公告的 Node TLS 憑證鏈驗證失敗。GCS RSS 可用，DSAT RSS 逐來源標不可用。沒有關閉 TLS。詳見 `../../SOURCE_AUDIT_2026-11-10.md`。
- 官方 RSS 是已發布消息，發布延遲、完整性及事件解除狀態未核實，不能提供完整事故速報。
- 路軌來自 OSM 已繪製幾何，站名對照官方網絡；列車沒有可核實的即時位置來源，仍是示意動畫。模型尺寸與建築結構亦屬示意。
- 未測試實體 iPhone／Android／觸控螢幕或 Safari。原生 App、推送、全網站點搜尋及轉乘規劃未在本輪實作。

## Review 結果

資料 adapter、LRT 幾何及動效分工 review 後，已修正巴士快照 freshness、快速導航與舊卡片交錯操作、手機離場控制仍可被讀取的問題。保留原 runtime、共享 cache、公開 API v1、官方 HLS 直播及三語。資料來源經 server-only adapter；新 RSS 經 Zod 正規化，限制官方 HTTPS 連結，摘要轉純文字。收藏及定位不進入 API／AI，金鑰不進入 client bundle 或版本庫。Review 補正 AI 巴士快照：各路線／方向保留獨立來源 id、時間及 stale，不能用最新路線目錄時間代替舊巴士位置時間。

移除了由本次替換造成的舊面板與 unused imports，保留原 Blender 檔及使用者原有 competition 檔案。部署前需要配置 AI 金鑰、檢查正式環境憑證，並清除受本輪修正影響的舊來源 cache 或等候 TTL 到期。沒有以測試通過宣稱政府來源始終可用。
