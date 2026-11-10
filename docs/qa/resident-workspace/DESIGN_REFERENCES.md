# 介面參考與本輪取捨

日期：2026-11-10。清單主導是使用者明確選擇。

- [Transit 官網](https://transitapp.com/) 的視覺以大標題、柔和背景、明確主色及具立體感的圖像建立層次。已實際瀏覽頁面。本站的巴士及輕軌入口圖像由自己的 Blender 模型渲染。
- [Transit 使用說明](https://help.transitapp.com/article/93-how-to-use-transit) 將附近路線、常用項目及選方向放在日常流程前面。本站採用直接主導航、收藏及選站後保留路線／方向控制。本站未有全網站點索引，所以不承諾全澳附近巴士站查詢。
- [Citymapper 的步行導引說明](https://citymapper.com/news/2266/turn-by-turn-directions-for-walking) 將目前操作與地圖模式明確分開。本站保留清單／地圖返回、站點焦點及直接 3D 開關；沒有加入未經驗證的逐步導航。

桌面合併成一行主導航，手機保留底部五入口。立體按鈕服務於巴士、輕軌及泊車選擇，AI 卡片服務於直接發問。路況顏色維持原有語意。來源時間在候車卡可見；歷史公告預設收起。沒有增加循環裝飾動畫或新的首頁 WebGL canvas。

用戶在版面審閱後要求更換字體及增加卡片。最終介面用 Noto Sans TC 可變字體，透過 Next.js 自託管；常用、附近、天氣、候車及來源各有卡片，主清單內部保持緊湊。卡片間距和背景區分功能範圍，3D 小組件保留在功能入口。

## 卡片過渡參考

同日再用實際瀏覽器操作以下頁面。觀察視覺效果與查閱實作文件分開記錄，沒有推測 Transit 使用哪個動畫套件。

- Transit 首頁的「See nearby transit／Real-time data」切換保留綠色卡片外框與選項位置，內容和手機圖像在同一範圍替換。本站採用固定導航、工具列與地圖，過渡集中在內容區。
- [Chrome Stack navigator 示範](https://view-transitions.chrome.dev/stack-navigator/spa/) 的列表進入詳情從右方移入，返回反向移出。本站用一致方向區分進入與返回，縮短移動距離，避免阻延查站。
- [My Patagonia Trip 示範](https://view-transitions.chrome.dev/my-patagonia-trip/) 點 Add 後，把相同照片及標題連接到右側的精簡卡片。本站以相同識別連接路線卡、站點和泊車詳情，讓選中項目有可追蹤的來源。

技術依據：Chrome 的 [element-scoped view transitions](https://developer.chrome.com/docs/css-ui/view-transitions/element-scoped-view-transitions) 可只捕捉內容子樹；[scoped component guidance](https://developer.chrome.com/docs/modern-web-guidance/guides/ui-behaviors/scoped-component-transitions) 說明功能偵測、快速重觸發與焦點要求。本站不截取整個 WebGL 地圖作切頁背景。不支援局部 API 的瀏覽器使用短暫 transform／opacity 進場，減少動態設定則直接更新。React 的同步 DOM 截取只用在原生過渡 callback 的整合點，依據 [flushSync 文件](https://react.dev/reference/react-dom/flushSync)。
