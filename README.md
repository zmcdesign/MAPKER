# 無障礙地圖速成器

這個資料夾已整理成可直接發布的靜態網站專案。正式公開時建議只發布 `site/` 資料夾，避免把歷史備份檔一起公開。

## 主要檔案

- `site/index.html`: 正式發布入口，Cloudflare Pages / GitHub Pages / Netlify 都會優先讀取這個檔案。
- `site/_headers`: Cloudflare Pages 設定檔，避免使用者一直看到瀏覽器快取的舊版 HTML。
- `mapker.html`: 主要工作檔，後續修改功能時可維持這個檔名。
- `index.html`: 根目錄預覽入口，內容目前與 `mapker.html` 相同。
- `_headers`: 根目錄備用 Cloudflare Pages 設定檔。

## 建議發布方式

最推薦使用 Cloudflare Pages + GitHub 連動：

1. 在 GitHub 建立一個新的 repository。
2. 上傳本資料夾內容。
3. 到 Cloudflare Dashboard 建立 Pages 專案。
4. 選擇 Connect to Git，連接剛剛的 GitHub repository。
5. Build command 留空。
6. Build output directory 填 `site`。
7. Deploy 後，Cloudflare 會提供 `https://專案名稱.pages.dev` 網址。

## 後續更新流程

每次修改完成後：

1. 將最新版 `mapker.html` 同步成 `index.html` 與 `site/index.html`。
2. 提交到 GitHub。
3. Cloudflare Pages 會自動重新部署，公開網址不需要更換。

## 本機預覽

互動回歸測試可執行 `npm --prefix tests install`，再執行 `npm --prefix tests test`。測試會載入現有 CDN 程式庫，需要網路連線。

要使用 OpenStreetMap 線稿底圖，請透過 HTTP/HTTPS 開啟網站。本機可用簡易伺服器預覽：

```sh
python3 -m http.server 8765
```

再打開：

```text
http://127.0.0.1:8765/
```

直接開啟 `file://` HTML 仍可編輯，但不會向 OSM 請求圖磚，因為本機檔案無法提供其要求的網站 Referer。

## 底圖顯示 403 / Access blocked

這是 OpenStreetMap 圖磚服務拒絕存取，不代表編輯器或繪圖資料損壞。一般性封鎖訊息本身不能確定是哪一項原因；請依 [OSM 封鎖說明](https://wiki.openstreetmap.org/wiki/Blocked) 與 [圖磚使用規範](https://operations.osmfoundation.org/policies/tiles/) 檢查。

- 使用 `https://tile.openstreetmap.org/{z}/{x}/{y}.png`；保留瀏覽器正常快取、真實的來源標頭與地圖署名。
- 在 Chrome Network 中檢查失敗圖磚的 Request Headers：網站請求應有真實的 `Referer`；隱私擴充功能或上游設定可能移除它。不要偽造來源或使用代理繞過封鎖。
- `_headers`、HTML meta 與 OSM 圖層皆設定 `strict-origin-when-cross-origin`。發布後仍須確認實際回應與瀏覽器送出的標頭。
- 編輯器會提示瀏覽器回報的圖磚載入錯誤，不自動重試或切換服務。若服務直接回傳可解碼的封鎖圖片，圖片可能觸發成功事件，無法僅靠 `tileerror` 偵測。
- 持續被封鎖時，依官方說明處理；正式服務若需要更穩定的底圖，應另接已取得使用授權的服務。
