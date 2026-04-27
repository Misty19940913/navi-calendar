# Navi Calendar

[![Obsidian Plugins](https://img.shields.io/badge/Obsidian-Plugins-7C3AED?logo=obsidian)](https://obsidian.md)
[![版本](https://img.shields.io/badge/Version-0.1.3-7C3AED?logo=obsidian)](https://github.com/Misty19940913/navi-calendar/releases)
[![MIT License](https://img.shields.io/badge/License-MIT-22C55E)](LICENSE)

---

**Navi Calendar** 是一款整合 FullCalendar 的 Life OS 日曆插件，支援日檢視（Day）、週檢視（Week）、月檢視（Month）、時間軸檢視（Timeline）和迷你日曆。任務直接寫入 Vault 中的 Markdown 檔案，frontmatter 完全符合 Life OS 知識管理系統的標準格式。

![Navi Calendar 截圖](screenshot.png)

---

## 功能特色

### 多檢視模式
| 檢視 | 說明 |
|---|---|
| **月檢視**（Month） | 經典月曆，拖放任務到指定日期 |
| **週檢視**（Week） | 一週時間格，顯示時間區塊任務 |
| **日檢視**（Day） | 單日細節檢視，24 小時時間軸 |
| **時間軸**（Timeline） | 跨日任務視覺化，適合專案里程碑 |
| **迷你日曆** | 側邊欄compact版本，點擊快速跳日 |

### 任務管理
- ✅ **建立任務**：在日曆上雙擊日期或使用命令列
- ✏️ **編輯任務**：右鍵選單 → 標題、優先級、開始/結束時間、循環
- 🔁 **循環任務**：支援 RRULE 語法（`FREQ=DAILY`、`FREQ=WEEKLY`...）
- ⏰ **提醒設定**：與 Obsidian Reminder 插件整合
- 📊 **看板檢視**（Kanban）：使用 ````task-kanban```` 程式碼區塊

### 依賴關係
```yaml
blockedBy: [#journal/2026-04-27.md:5]   # 必須完成哪些任務
blocking: [#journal/2026-04-27.md:8]   # 哪些任務在等我完成
subtasks: [task-1, task-2]              # 子任務
projects: [#Project/Navi, #Project/Helios]  # 所屬專案
```

### AI 命令列
在插件設定中啟用後，可透過自然語言管理任務：

```
Add task: 完成季度報告 due tomorrow
Edit task 'Meeting': set due 2026-05-01
Complete task 'Report'
Move task 'Meeting' to 2026-05-01
```

### 任務 Frontmatter 格式
```yaml
---
type: task
status: " "
time_created: "2026-04-27T10:00:00.000Z"
scheduled: "2026-04-28"
due: "2026-04-30"
startTime: "09:00"
endTime: "10:00"
priority: medium
tags: [#life-os/task, #vocation]
blockedBy: [#journal/2026-04-25.md:3]
blocking: [#journal/2026-04-28.md:1]
subtasks: [task-1, task-2]
projects: [#Project/Navi]
---
# 任務標題
```

---

## 安裝方式

### 方式一：社群插件市場（推薦）
1. 開啟 Obsidian → 設定 → 社群插件
2. 搜尋 **Navi Calendar**
3. 點擊安裝
4. 啟用插件

### 方式二：手動安裝（開發者）
```bash
# Clone 本倉庫
git clone https://github.com/Misty19940913/navi-calendar.git

# 安裝依賴
cd navi-calendar
npm install

# 建置插件
npm run build

# 複製到 Vault 插件目錄
# （或使用 npm run copy-vault 自動複製到預設路徑）
```

> 建置完成後，`navi-calendar` 目錄就是插件資料夾。詳見 [建置腳本](scripts/copy-to-vault.mjs)。

---

## 快速開始

1. **設定日誌資料夾**：設定 → Navi Calendar → 設定 **Journal 資料夾路徑**（任務日記的根目錄）
2. **開啟日曆**：點擊左側功能列的 📅 圖示，或使用命令面板（`Ctrl/Cmd + P`）輸入 `Open Calendar`
3. **建立任務**：在月檢視雙擊任意日期，或使用命令 `Add task: 任務標題`
4. **拖放調整**：將任務拖放到不同日期即可更新 `scheduled` / `due` 欄位

---

## 設定選項

| 選項 | 預設值 | 說明 |
|---|---|---|
| Journal 資料夾 | `journal/` | 任務日記的根目錄 |
| 任務資料夾 | `tasks/` | 獨立任務檔案的存放位置 |
| 開啟方向 | `new-tab` | 日曆在新分頁或當前分頁開啟 |
| 迷你日曆位置 | `right` | 側邊欄迷你日曆靠左或靠右 |
| 預設優先級 | `none` | 新任務的預設優先級 |
| 顯示已完成 | `true` | 在日曆上顯示已完成任務 |
| 自動重新整理 | `true` | 檔案變更後自動重新載入 |
| 開啟 AI 命令 | `false` | 啟用自然語言命令列 |

---

## 開發指南

### 本地開發
```bash
npm install
npm run dev      # 開發模式（監聽變更並自動重載）
npm run build    # 生產建置
```

### 資料夾結構
```
navi-calendar/
├── src/
│   ├── main.ts              # 插件主入口
│   ├── views/
│   │   ├── CalendarView.ts  # 月/週/日 FullCalendar 檢視
│   │   ├── TimelineView.ts   # 時間軸檢視
│   │   └── MiniCalendarView.ts  # 側邊欄迷你日曆
│   ├── modals/
│   │   ├── TaskModal.ts     # 任務編輯 Modal（基底）
│   │   ├── TaskCreationModal.ts  # 新建任務
│   │   └── TaskEditModal.ts # 編輯任務
│   ├── services/
│   │   ├── TaskService.ts   # 任務 CRUD 與 frontmatter 讀寫
│   │   └── ViewStateManager.ts  # 檢視狀態管理
│   ├── kanban/
│   │   ├── TaskKanbanView.ts    # 看板檢視（React）
│   │   └── TaskKanbanPostProcessor.ts  # ```task-kanban``` 區塊處理
│   ├── components/          # 右鍵選單（優先級/循環/提醒/狀態）
│   └── settings/             # 設定頁面
├── manifest.json             # Obsidian 插件清單
└── package.json
```

### 新增 AI 命令處理器
```typescript
import { AICommandHandler } from './main';

const myHandler: AICommandHandler = {
  name: 'my-command',
  description: 'My custom AI command',
  execute: async ({ plugin, taskService, message }) => {
    // 自訂處理邏輯
    return '處理結果';
  },
};

plugin.registerAICommandHandler(myHandler);
```

---

## Roadmap

- [ ] Obsidian Tasks Plugin 整合（`tasks` emoji 語法支援）
- [ ] 顏色標籤系統（自訂任務顏色）
- [ ] 多人協作同步（CRDT-based）
- [ ] 匯出功能（iCal、JSON）
- [ ] 統計面板（熱度圖、完成率）

---

## 貢獻指南

歡迎 Pull Request！請先閱讀 [CONTRIBUTING.md](CONTRIBUTING.md)。

```bash
# Fork 並 Clone 後
npm install
npm run dev    # 開始開發

# 提交前
npm run build  # 確保編譯通過
```

---

## 授權

本專案採用 [MIT License](LICENSE) 開源。
