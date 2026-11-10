# 交通消息與資料準確度審核

檢查日期：2026-11-10，澳門時間。這份紀錄只涵蓋下列頁面及本機連線結果，不聲稱已查盡所有澳門服務。

## 本輪接入的來源

政府的 [RSS 訂閱目錄](https://www.gov.mo/zh-hant/directory/rss-feeds/) 列出新聞局及交通事務局新聞 RSS。直接讀取真實 XML 後新增 server-only `official-news` adapter，經共享 cache 提供 `/api/v1/traffic/news`。

| 來源 | 真實回應 | 時間欄位 | 本輪處理 |
| --- | --- | --- | --- |
| [新聞局政府新聞](https://govinfohub.gcs.gov.mo/api/rss/n/zh-hant) | curl 取得 33 項 RSS；17:31 的 Node adapter 測試成功，交通標題篩選後有 2 項 | ISO pubDate，含 +08:00 時區 | 每 180 秒取資料，HTML 摘要轉純文字，保留官方連結及發布時間 |
| [交通事務局新聞](https://www.dsat.gov.mo/tc/news_rss.aspx) | curl 取得 20 項 RSS；本機 Node fetch 未能驗證憑證鏈 | RFC 形式 pubDate | adapter 已支援，但逐來源標示不可用；另一個來源可繼續供應 |
| [DSAT 特別消息](https://www.dsat.gov.mo/dsat/emergency.aspx)、[交通改道](https://www.dsat.gov.mo/dsat/croad.aspx)、[巴士改道](https://www.dsat.gov.mo/dsat/bus_croad.aspx) | 本機三頁皆讀取失敗 | 公布日期與工程生效日期不是同一欄位 | 全部失敗就拋錯，交給共享 cache 保留有效舊資料。工程日期不再當作發布時間 |

新聞局當日樣本：

- [配合深圳水上交通管控，福永客船暫停六天](https://www.gcs.gov.mo/detail/zh-hant/N26KJPCohE)，發布 11 月 10 日 16:16，內容說明 11 月 16 至 21 日的安排。
- [松山隧道11月13日及20日凌晨封閉交通](https://www.gcs.gov.mo/detail/zh-hant/N26KJhqhl4)，發布 11 月 10 日 11:12，內容說明未來兩天的指定封閉時段。

這兩個樣本證明抓取時間、發布時間及生效時間需要分開。每 3 分鐘抓取不會令新聞稿變成每 3 分鐘更新的事故紀錄。

`feeds[].available` 表示該次取得成功，不表示發布內容仍然有效。單一來源失敗會顯示部分來源不可用；全部失敗才使用共享 cache 的 stale fallback。GCS 只按交通相關標題篩選，可能漏掉標題沒有相關字詞的消息。RSS 只提供有限近期項目，不是完整歷史。

## 其他候選渠道

| 渠道 | 已核實的用途及本輪結果 | 決定 |
| --- | --- | --- |
| [治安警察局](https://www.fsm.gov.mo/psp/m/cht/default.aspx) | 有新聞及口岸實時平台入口。[2026-04-29 官方新聞稿](https://www.fsm.gov.mo/psp/m/cht/news/shownewsdetail.aspx?newsid=3860) 提到電視、電台、社交媒體及手機新聞渠道發布交通管制資訊 | 已有口岸狀態 adapter。本輪未核實可重用、具開始／解除時間的道路事故接口，不能稱為完整事故流 |
| [平安澳門介紹](https://www.spu.gov.mo/index.php?a=show&c=index&catid=17&id=601&lang=tw&m=content) | 警察總局介紹微信小程序的緊急、民防消息及地圖警務措施；網站主頁本次工具讀取回 403 | 保留為後續資料合作線索，未把小程序資料接入網頁 |
| [新福利官網](https://www.transmac.com.mo/en/) | 直接頁面有 Routes Changes，例如 11 月 13 日松山隧道工程臨時巴士措施 | 適合補服務通告。日期可能是措施日期，需逐詳情頁核實。已有 DSAT 停站切片，本輪不把公告當即時事故 |
| [澳巴官網](https://www.tcm.com.mo/web/) | 搜尋索引有臨時措施及公司新聞；直接網頁讀取本次超時 | 沒有以舊搜尋摘要充當即時內容，留作官方參考 |
| [澳廣視新聞](https://www.tdm.com.mo/zh-hant/news) | 本次工具無法讀取頁面 | 未核實可用接口、覆蓋及轉載條件，未接入 |
| [DSAT 即時路面](https://www.dsat.gov.mo/dsat/realtime.aspx) | 官方鏡頭入口，既有相機 catalog 已可用 | 保留官方 HLS 直播供用戶查看。沒有以影像或擠塞顏色推斷事故原因 |

下一步若要事故速報，先向 DSAT／治安警察查詢可用的事件資料及再發布條件。驗收至少需要穩定事件 id、發布／更新時間、地點、事件狀態及解除標記。發布延遲要持續量測，不能由一次成功請求推定。未取得這些條件前，頁面使用「交通公告」。

## 準確度修正

- 口岸原先把狀態碼轉成 10／30／45／60 分鐘。這些不是官方分鐘欄位，已移除；`estimatedWaitMinutes` 保持 null，顯示官方定性狀態。
- 泊車發布時間缺失或解析失敗時保持 null。最後取得時間另由 envelope meta 提供。
- 交通公告沒有持續事件／解除資料。關鍵字分類不證明事故仍在進行，空列表不代表沒有事故。
- 客戶端會按經過時間把快照標成延遲。候車卡本身亦顯示取得時間，避免捲動後看不到資料狀態。
- 巴士維持官方剩餘站數，不換算成到站分鐘。停站消息優先於其他切片的即將進站訊號。輕軌列車動畫保持示意標示。

## 刻意連線驗證

`npm run verify:sources` 在 16:55 澳門時間的結果如下。這是連線及 parser 驗證，不是官方資料內容的獨立實地核對。

| 模組 | 結果 |
| --- | --- |
| 道路、橋、鏡頭、巴士目錄 | 成功，分別 1,268／8／118／90 項 |
| 天氣、官方 RSS、輕軌網絡、輕軌公告 | 成功；輕軌網絡允許 checked-in fallback，此檢查不證明取得全新 Overpass 幾何 |
| 口岸 | adapter 成功，8 項；較早直接請求曾收到 HTML challenge，來源可用性會波動 |
| 泊車、舊 DSAT 公告 | 失敗，本機 Node 的底層錯誤為 `UNABLE_TO_VERIFY_LEAF_SIGNATURE` |

完整命令因必需來源失敗而以 exit 1 結束。未關閉 TLS 驗證。curl 可取得 DSAT RSS 不等於部署環境的 Node 同樣可用；正式環境要另行檢查憑證鏈及來源連線。本輪沒有部署、沒有更改系統信任設定。

單元測試使用 fixtures，e2e mock 公開 API、HLS 及 OpenFreeMap style。它們驗證程式行為，不能證明政府來源在任何時刻皆可用。

## 輕軌走線與舊公告的追加檢查

本輪另外讀取 [氹仔線 relation 10402162](https://api.openstreetmap.org/api/0.6/relation/10402162/full.json)、[石排灣線 18238277](https://api.openstreetmap.org/api/0.6/relation/18238277/full.json) 及 [橫琴線 18361945](https://api.openstreetmap.org/api/0.6/relation/18361945/full.json)。這是一次重建所用的公開 OSM 原始軌道資料，沒有新增常態輪詢端點。

舊接駁程式只向尾部追近端點，氹仔線因此有約 1.53km 的人為跳接。改成兩端只接相連端點後，再按原始站點裁掉氹仔碼頭前約 307m 的過走軌道。三條線分別保留 389、27、31 個軌道點。沿線站點對照 MLM 官方路線名稱，轉乘站保存每條線的 stop position。站點到其線上幾何小於 5m 的測試全部通過。這是資料內部一致性，不是官方地籍精度驗證；OSM 原有的長直線段仍按來源保留，未用自畫曲線填補。紀錄在 `qa/resident-workspace/lrt-geometry.json`。

政府地圖服務目錄亦已查看。本次讀取的底圖與 POI 圖層未建立可直接接入的輕軌線資料來源，所以沒有宣稱政府測繪走線。MLM 路線頁有固定出發時刻表。未核實到可用的官方列車即時位置接口，示意動畫維持原標示。

[MLM 公告 RSS](https://www.mlm.com.mo/rss/tc/notice.rss) 的真實回應有兩則 2024-09-29 消息，皆 `show=false`。原 parser 只保留第一則，頁面仍展示舊故障內容。現已保留全部項目並將停止展示的項目收在歷史區。RSS 的 CST 依澳門發布方解作 UTC+08:00。`active` 的語意只限發布方展示旗標，AI 不可當作獨立核實的持續事故狀態。
