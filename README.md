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

可以直接用瀏覽器開啟 `index.html`，或用簡易伺服器預覽：

```sh
python3 -m http.server 8765
```

再打開：

```text
http://127.0.0.1:8765/
```
