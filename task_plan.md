# Task Plan: Navi Calendar TaskModal 重構

## 概述

將 `navi-calendar` 的 `TaskCreationModal` 重構為功能完整的 TaskNotes 風格任務編輯 Modal，支援 Action Bar、Dependencies、Subtasks、Projects、Expanded Split Layout 和 Task Link Overlay（共 11 個範疇）。

**開發目錄**: `/tmp/navi-calendar-dev/`  
**分支**: `main`  
**參考實作**: `/tmp/tasknotes/src/modals/TaskModal.ts`

---

## 範疇 1：基底重構（Base Refactoring）

### 目標
建立統一的 TaskModal base class，讓 TaskCreationModal 和 TaskEditModal 繼承共享邏輯。

### 具體步驟

1. **建立 `src/modals/TaskModal.ts`** - 抽象 base class
   - 將 `TaskCreationModal` 重構為 base class，移除 creation-specific 邏輯
   - 包含通用 UI 渲染（title input、action bar container、details area）
   - 定義抽象方法：`getTitle()`, `getCurrentTaskPath()`, `onSave()`, `onClose()`
   - 實現共同功能：keyboard handler、split layout toggle、expansion state

2. **建立 `src/modals/TaskCreationModal.ts`** - 繼承 base
   - 實現 creation-specific：`prePopulatedValues`, `onTaskCreated` callback
   - 覆寫 `getTitle()` → "New Task"
   - 覆寫 `onSave()` → 呼叫 `taskService.createTask()`

3. **建立 `src/modals/TaskEditModal.ts`** - 繼承 base
   - 接收現有 `TaskInfo` 物件
   - 覆寫 `getTitle()` → "Edit Task"
   - 覆寫 `getCurrentTaskPath()` → 任務檔案路徑
   - 覆寫 `onSave()` → 呼叫 `taskService.updateTask()`
   - 實現 delete、toggle completion 功能

4. **更新 `src/modals/index.ts`** - 匯出重構後的 classes

### 預估複雜度：**高**
- 涉及大量現有程式碼重構
- 需要確保 backward compatibility

### 建議順序
- Step 1 → Step 2, 3（可並行，但 Step 2/3 依賴 Step 1 介面設計）
- Step 4 在 Step 2, 3 完成後

### 風險點
- 現有 TaskCreationModal 被其他模組引用，需同步更新所有 call sites
- base class 設計不當會導致後續擴展困難

---

## 範疇 2：Action Bar（6 個 Icon 按鈕）

### 目標
實作 TaskNotes 風格的 Action Bar，包含 6 個快捷操作按鈕。

### 具體步驟

1. **建立 Action Bar 容器**
   - 在 modal 頂部（title input 下方）建立 horizontal action bar container
   - CSS class: `task-modal-action-bar`
   - 配置 flexbox 橫向排列，間距 8px

2. **Due Date 按鈕**
   - Icon button with calendar emoji (📅)
   - 點擊時開啟 context menu date picker
   - 顯示目前設定的日期（若無則顯示 "Set due"）
   - 參考：`DateContextMenu` in TaskNotes

3. **Scheduled Date 按鈕**
   - Icon button with clock emoji (⏰)
   - 點擊時開啟 context menu date picker
   - 顯示目前設定的日期（若無則顯示 "Set scheduled"）

4. **Status 按鈕**
   - Icon button，显示当前状态符号 (⭕/❌/▶️/—)
   - 點擊時開啟 `StatusContextMenu`
   - 支援狀態：未做(⭕)、已完成(❌)、進行中(▶️)、取消(—)
   - 狀態切換即時更新按鈕顯示

5. **Priority 按鈕**
   - Icon button，显示当前优先级 (🔺/🔻/—)
   - 點擊時開啟 `PriorityContextMenu`
   - 支援優先級：無(—)、高(🔺/🔴)、低(🔻/🟢)

6. **Recurrence 按鈕**
   - Icon button with repeat emoji (🔁)
   - 點擊時開啟 `RecurrenceContextMenu`
   - 設定 recurrence rule（RRule format）
   - 支援：daily、weekly、monthly、yearly、custom

7. **Reminders 按鈕**
   - Icon button with bell emoji (🔔)
   - 點擊時開啟 `ReminderContextMenu`
   - 設定多個提醒時間點
   - 支援 relative（如 "1 day before"）和 absolute 時間

8. **建立 Context Menu Components**（可與 Step 2-7 並行）
   - `src/components/DateContextMenu.ts` - 日期選擇器
   - `src/components/StatusContextMenu.ts` - 狀態選擇
   - `src/components/PriorityContextMenu.ts` - 優先級選擇
   - `src/components/RecurrenceContextMenu.ts` - 重複規則
   - `src/components/ReminderContextMenu.ts` - 提醒設定

### 預估複雜度：**中**
- Context menu 實作較為複雜
- Date picker 需要整合現有 calendar UI 邏輯

### 建議順序
- Step 1 先完成（基礎設施）
- Step 8 與 Step 2-7 可並行

### 風險點
- Context menu positioning 需要處理 modal 邊界情況
- 多個 context menu 可能衝突（需確保同時只有一個開啟）

---

## 範疇 3：Dependencies 系統（雙向連結）

### 目標
實作 blockedBy/blocking 雙向連結，確保修改任一方都會自動同步。

### 具體步驟

1. **擴展 TaskInfo 類型**（`src/types.ts`）
   - 添加 `blockedBy: TaskDependency[]`
   - 添加 `blocking: TaskDependency[]`
   - 定義 `TaskDependency` 介面：`uid`, `reltype`, `gap`

2. **建立 Dependency Item UI**
   - 建立 `blockedByList` 和 `blockingList` container elements
   - 每個 item 顯示任務連結 + 移除按鈕
   - 支援點擊跳轉到被封鎖任務
   - CSS class: `task-dependency-item`, `task-dependency-remove`

3. **實作 Add Dependency UI**
   - 每個 list 下方有 "Add blocker" / "Add blocked by" 按鈕
   - 點擊開啟任務選擇器（`TaskSelectorModal`）
   - 過濾條件：不能選擇自己、不能選擇已存在的依賴

4. **實作 reltype 選擇**
   - 三選項：unsorted / do-date / in-date
   - 顯示在每個 dependency item 旁邊
   - 可點擊切換

5. **實作雙向同步邏輯**（TaskService）
   - 當設定 A.blockedBy = [B] 時，自動將 A 的 UID 加入 B.blocking
   - 當移除 A.blockedBy 中的 B 時，自動從 B.blocking 移除 A
   - 在 `updateTask()` 中實作同步
   - 考慮 transaction 確保一致性

6. **處理刪除情境**
   - 當刪除任務時，自動清理所有依賴該任務的 blockedBy/blocking 引用

### 預估複雜度：**高**
- 雙向同步邏輯容易出錯
- 需要處理循環依賴（應阻止）

### 建議順序
- Step 1 → Step 2, 3（依賴類型定義）→ Step 4 → Step 5（核心同步）→ Step 6

### 風險點
- 循環依賴可能導致無窮迴圈
- 並行編輯多個任務時同步可能不一致
- 大量依賴時效能考量

---

## 範疇 4：Subtasks 系統

### 目標
允許將其他任務設為當前任務的子任務，支援巢狀讀取。

### 具體步驟

1. **擴展 TaskInfo 類型**
   - 添加 `subtasks: string[]` - 陣列存放 subtask 任務 UID

2. **建立 Subtasks UI Section**
   - 在 modal 中建立 `subtasksList` container
   - 顯示所有子任務（以 task card 形式）
   - 每個 item 有移除按鈕

3. **實作 Add Subtask UI**
   - "Add subtask" 按鈕
   - 開啟任務選擇器（可選擇多個）
   - 過濾條件：不能選擇自己、不能選擇已是 subtask 的任務

4. **TaskService 巢狀讀取**
   - 新增 `getSubtasks(taskId: string): Promise<TaskInfo[]>`
   - 新增 `getTaskWithSubtasks(taskId: string): Promise<TaskInfo & { subtasks: TaskInfo[] }>`
   - 支援多層巢狀（max depth 設定）

5. **整合 TaskCard 顯示**
   - 在 TaskCard 上顯示 subtask count badge
   - 點擊可展開/摺疊顯示 subtasks

### 預估複雜度：**中**
- UI 實作相對簡單
- 巢狀讀取深度控制需要注意

### 建議順序
- Step 1 → Step 2, 3 → Step 4 → Step 5

### 風險點
- 過深巢狀影響效能
- 循環 subtask 引用（同一人不能是自己和祖先的 subtask）

---

## 範疇 5：Projects 系統

### 目標
支援任務隸屬多個專案，使用 Obsidian internal link 格式。

### 具體步驟

1. **擴展 TaskInfo 類型**
   - 添加 `projects: string[]` - 專案名稱陣列

2. **建立 Projects UI Section**
   - 在 modal 中建立 `projectsList` container
   - 以 pills/chips 形式顯示每個專案
   - 每個 chip 有移除按鈕

3. **實作 Add Project UI**
   - "Add project" 按鈕
   - 開啟專案選擇器（掃描 vault 中的資料夾/專案筆記）
   - 或支援輸入專案名稱自動建立連結

4. **實作 Project Selector Modal**
   - 參考 TaskNotes 的 `ProjectSelectModal.ts`
   - 顯示 vault 中所有可能的專案
   - 支援搜尋/過濾

5. **使用 Obsidian Internal Link**
   - 專案儲存為 `[[ProjectName]]` 格式
   - 在 modal 中正確渲染連結

### 預估複雜度：**低**
- 較為獨立的功能模組

### 建議順序
- Step 1 → Step 2, 3 → Step 4, 5

### 風險點
- 專案名稱衝突（不同資料夾可能有同名專案）
- 專案刪除後連結變成 unresolved

---

## 範疇 6：Expanded Split Layout

### 目標
實作雙欄佈局，左側表單、右側 Markdown 編輯器，支援 expand/collapse。

### 具體步驟

1. **建立 Split Layout CSS**
   - 新增 CSS class: `.task-modal-split-layout`
   - `.task-modal-split-layout.expanded` 控制展開狀態
   - 左側 `.task-modal-form-panel`、右側 `.task-modal-editor-panel`
   - 預設：expanded=false → 只有左側表單
   - expanded=true → 左右雙欄

2. **實作 Toggle Expand 按鈕**
   - 在 modal 右上角加入 expand/chevron 按鈕
   - 點擊切換 `isExpanded` 狀態
   - 更新 CSS class

3. **實作左右分欄渲染**
   - 左側（表單面板）：
     - Title input
     - Action bar
     - Dependencies section
     - Subtasks section
     - Projects section
     - 其他自定義欄位
   - 右側（編輯器面板）：
     - Markdown description 編輯器（使用 CodeMirror）
     - 即時預覽

4. **整合 CodeMirror 編輯器**
   - 參考 TaskNotes 的 `EmbeddableMarkdownEditor`
   - 或使用 Obsidian 的 `Editor` API
   - 支援語法高亮、自动完成

5. **處理響應式設計**
   - narrow viewport 時自動折疊為單欄
   - maintain 最小寬度確保可用性

### 預估複雜度：**高**
- Split layout 邏輯複雜
- CodeMirror 整合需要處理編輯器生命週期

### 建議順序
- Step 1 → Step 2 → Step 3, 4（可並行）→ Step 5

### 風險點
- 編輯器與 modal 生命週期管理
- 不同 viewport 下的 UX 一致性
- 性能：大型 description 時編輯器可能卡頓

---

## 範疇 7：SettingsTab 擴充

### 目標
在 Settings Tab 中新增任務相關設定選項。

### 具體步驟

1. **新增 Settings 類型**（`src/types.ts`）
   ```typescript
   interface TaskModalSettings {
     enableModalSplitLayout: boolean;
     defaultExpanded: boolean;
     tasksFolder: string;
     taskTemplatePath: string;
     // ... 更多設定
   }
   ```

2. **擴充 `NaviCalendarSettings`**（`src/types.ts`）
   - 添加 TaskModal 相關預設值

3. **在 SettingsTab 中新增設定群組**
   - "Task Modal" 設定區段
   - 項目：
     - Enable Split Layout（toggle）
     - Default to Expanded（toggle）
     - Tasks Folder（text input）
     - Task Template Path（text input）
     - Show Action Bar by Default（toggle）

4. **實作設定讀寫**
   - 在 base TaskModal 中讀取這些設定
   - 根據設定初始化 UI 狀態

### 預估複雜度：**低**
- 標準 Settings API 應用

### 建議順序
- Step 1, 2 → Step 3 → Step 4

### 風險點
- 設定迁移（舊設定使用者需要預設值）

---

## 範疇 8：TaskService 重構

### 目標
重構 TaskService，支援完整的 CRUD 操作和雙向連結同步。

### 具體步驟

1. **維持 `ensureDailyNote()`**
   - 保持現有功能，確保 journal folder 中的每日筆記存在

2. **重構 `createTask()`**
   - 接收完整的 `TaskCreationData`
   - 生成 task file path（使用 tasksFolder + 唯一檔名）
   - 建立符合 TaskNotes frontmatter 格式的檔案內容
   - 同步處理 subtasks、projects、dependencies

3. **實作 `updateTask()`**
   - 讀取現有檔案內容
   - 解析並更新 frontmatter
   - 處理雙向連結同步：
     - 比較新舊 blockedBy/blocking 差異
     - 自動更新受影響任務的對應欄位
   - 處理 subtasks、projects 變更

4. **實作 `getTask()`**
   - 解析 TaskInfo（含 blockedBy/blocking/subtasks/projects 解析）
   - 將 UID 解析為實際任務資訊
   - 快取解析結果

5. **實作 `deleteTask()`**
   - 刪除任務檔案
   - 清理所有依賴該任務的 blockedBy/blocking 引用

6. **新增輔助方法**
   - `getTaskByUid(uid: string): Promise<TaskInfo>`
   - `getTaskDependencies(task: TaskInfo): Promise<TaskDependency[]>`
   - `getSubtasks(taskId: string): Promise<TaskInfo[]>`
   - `resolveDependencyLinks(task: TaskInfo): void`

### 預估複雜度：**高**
- 雙向同步邏輯複雜
- 需要處理各種 edge cases

### 建議順序
- Step 1 → Step 2 → Step 3（核心）→ Step 4 → Step 5 → Step 6

### 風險點
- 雙向同步可能導致性能問題（大量任務時）
- 循環依賴檢查

---

## 範疇 9：Frontmatter 格式對齊

### 目標
對齊 TaskNotes 的 frontmatter 格式，確保互通性。

### 具體步驟

1. **定義標準 Frontmatter Schema**
   ```yaml
   ---
   type: task
   title: "Task title"
   status: "未做" | "已完成" | "進行中" | "取消"
   priority: "無" | "高" | "低"
   due: YYYY-MM-DD
   scheduled: YYYY-MM-DD
   created: ISO timestamp
   modified: ISO timestamp
   blockedBy:
     - "[[Task-UID]]"
   blocking:
     - "[[Task-UID]]"
   reltype: unsorted | do-date | in-date
   subtasks:
     - "[[Task-UID]]"
   projects:
     - "[[Project-Name]]"
   recurrence: RRule string
   reminder: ISO timestamp or duration
   tags:
     - tag1
     - tag2
   ---
   ```

2. **建立 Frontmatter 解析/序列化工具**
   - `src/utils/frontmatterUtils.ts`
   - `parseTaskFrontmatter(content: string): TaskInfo`
   - `serializeTaskFrontmatter(task: TaskInfo): string`

3. **更新 TaskService 使用新格式**
   - 在 createTask/updateTask 中使用新工具函數
   - 確保 backward compatibility（舊格式遷移）

4. **處理 description body**
   - frontmatter 之後的內容視為 description
   - 支援 Markdown 格式

### 預估複雜度：**中**
- 格式定義相對明確
- 遷移需要處理舊資料

### 建議順序
- Step 1 → Step 2（工具函數）→ Step 3 → Step 4

### 風險點
- 舊資料遷移可能丟失資訊
- 與 TaskNotes 的格式完全相容性驗證

---

## 範疇 10：Calendar 整合

### 目標
整合 FullCalendar 事件與新的 TaskModal。

### 具體步驟

1. **更新 FullCalendar select callback**
   - 點擊日曆空閒時段 → 開啟 TaskCreationModal
   - 傳遞選中日期作為 prePopulated scheduled date
   - 支援時間範圍選擇（timegrid view）

2. **實作點擊任務開啟編輯**
   - 點擊日曆上的任務事件 → 開啟 TaskEditModal
   - 傳遞對應的 TaskInfo

3. **Context Menu 快速操作**
   - 右鍵點擊任務事件 → 顯示 context menu
   - 選項：Edit、Delete、Toggle Complete、Change Priority...
   - 參考 FullCalendar eventContextMenu

4. **更新日曆顯示**
   - 根據新 status/priority 調整事件顯示樣式
   - blocked 任務顯示不同顏色/樣式
   - 支援拖曳調整日期（调用 updateTask）

5. **整合日曆視圖刷新**
   - 任務編輯/創建後自動刷新日曆顯示
   - 使用 `triggerDataChanged()` 機制

### 預估複雜度：**中**
- 需要熟悉 FullCalendar API
- context menu 整合可能繁瑣

### 建議順序
- Step 1, 2（基本整合）→ Step 3 → Step 4, 5

### 風險點
- FullCalendar 版本更新可能破壞整合
- 多視圖（month/week/day）下的行為一致性

---

## 依賴關係圖

```
範疇 9（Frontmatter 格式）
      ↓
範疇 8（TaskService 重構）
      ↓
範疇 1（基底重構）←————+
      ↓                 |
範疇 2（Action Bar）    |（雙向）
      ↓                 |
範疇 3（Dependencies）——→+
      ↓
範疇 4（Subtasks）
      ↓
範疇 5（Projects）
      ↓
範疇 6（Split Layout）←+（settings）
      ↓                 |
範疇 7（SettingsTab）——+
      ↓
範疇 10（Calendar 整合）
```

---

## 建議實作順序

### Phase 1：Foundation（第 1-2 週）
1. **範疇 9** - Frontmatter 格式定義（先定義清楚目標格式）
2. **範疇 8** - TaskService 重構（核心資料層）
3. **範疇 1** - Base TaskModal class

### Phase 2：UI Components（第 2-3 週）
4. **範疇 2** - Action Bar + Context Menus
5. **範疇 3** - Dependencies 系統
6. **範疇 4** - Subtasks 系統
7. **範疇 5** - Projects 系統

### Phase 3：Advanced Features（第 3-4 週）
8. **範疇 6** - Split Layout
9. **範疇 7** - SettingsTab 擴充
10. **範疇 10** - Calendar 整合

---

## 並行工作建議

- **範疇 2 Context Menus** 可以並行開發（5 個 context menu 獨立）
- **範疇 4 & 5**（Subtasks & Projects）可並行
- **範疇 6 & 7** 在 settings 定義完成後可並行

---

## 風險總結

| 風險 | 嚴重性 | 緩解策略 |
|------|--------|----------|
| 雙向同步邏輯出錯 | 高 | 寫單元測試、使用 transaction |
| 循環依賴 | 高 | 每次添加前檢查 |
| 舊資料遷移 | 中 | 提供 migration script |
| 編輯器整合複雜度 | 中 | 使用 Obsidian 內建 Editor |
| 效能（大量任務） | 中 | 快取、延遲載入 |

---

## Commit 規範

使用 Conventional Commits：

```
feat: 建立 TaskModal base class
feat: 實作 Action Bar UI
feat: 新增 Dependencies 雙向連結系統
feat: 實作 Subtasks 系統
feat: 實作 Projects 系統
feat: 新增 Split Layout 編輯器
feat: 擴充 SettingsTab 設定
refactor: TaskService 重構
style: 更新 TaskModal CSS
test: 新增 TaskService 單元測試
fix: 修復 Dependencies 同步問題
```

---

## 檔案變動預估

### 新建
- `src/modals/TaskModal.ts`（base class）
- `src/modals/TaskCreationModal.ts`（更新）
- `src/modals/TaskEditModal.ts`（更新）
- `src/components/DateContextMenu.ts`
- `src/components/StatusContextMenu.ts`
- `src/components/PriorityContextMenu.ts`
- `src/components/RecurrenceContextMenu.ts`
- `src/components/ReminderContextMenu.ts`
- `src/utils/frontmatterUtils.ts`
- `src/editor/TaskLinkOverlay.ts`（CodeMirror ViewPlugin）
- `src/editor/TaskLinkWidget.ts`（inline task card widget）
- `src/editor/ReadingModeTaskLinkProcessor.ts`（MarkdownPostProcessor）

### 修改
- `src/types.ts`
- `src/services/TaskService.ts`
- `src/settings/SettingsTab.ts`
- `src/styles.css`
- `src/main.ts`（匯出更新、editor extension 註冊）
- `src/ui/TaskCard.ts`（showTaskContextMenu 函式）

### 刪除
- 預計無刪除（所有現有功能都會保留並擴展）

---

## 範疇 11：Task Link Overlay（任務連結疊加層）

### 目標
在 Obsidian 編輯器和閱讀模式中，將 `[[任務標題]]` wikilink 自動轉換為任務預覽小卡（inline task card），包含狀態指示器（彩色小圓點）和右側操作選單（三個點 → 開啟 expanded split-layout TaskEditModal）。

### 具體步驟

1. **建立 `src/editor/TaskLinkOverlay.ts`**
   - 建立 CodeMirror ViewPlugin工廠 `createTaskLinkViewPlugin(plugin)`
   - 實作 `taskUpdateEffect` StateEffect，用於任務更新時刷新裝飾
   - 在 `decorations` 中使用 `Decoration.mark()` 標記任務wikilinks
   - 監聽 `EVENT_TASK_UPDATED`、`EVENT_TASK_DELETED`、`EVENT_DATE_CHANGED` 事件自動刷新
   - 實作 `buildDecorations()` — 掃描 editor 文件內容，找出所有 `[[xxx.md]]` 或 `[[xxx|alias]]` 格式的內部連結，檢查目標是否為任務（`type: task` frontmatter），若是則用 `TaskLinkWidget` 替換

2. **建立 `src/editor/TaskLinkWidget.ts`**
   - 繼承 `WidgetType`，實作 `toDOM()` — 回傳任務 inline card
   - 使用 `createTaskCard(task, plugin, visibleProperties, { layout: "inline" })`
   - `eq()` 比對 `taskInfo.path`、`status`、`title`、`priority`、`archived`、`due`、`scheduled`、`recurrence`、`dateModified`
   - `ignoreEvent("mousedown"|"click")` 返回 `true` 防止遊標跳入 widget
   - `block` getter 回傳 `false`（inline widget）

3. **建立 `src/editor/ReadingModeTaskLinkProcessor.ts`**
   - 實作 `MarkdownPostProcessor` — 在閱讀模式下將 wikilink 替換為任務 widget
   - `processLink()` — 解析 `href` 取得目標檔案路徑，使用 `metadataCache.getFirstLinkpathDest()` 解析相對路徑
   - `replaceWithTaskWidget()` — 呼叫 `TaskLinkWidget.toDOM()` 並替換原 link 元素

4. **在 `src/main.ts` 註冊 editor extension + post-processor**
   - `plugin.registerEditorExtension(createTaskLinkViewPlugin(plugin))`
   - `plugin.registerMarkdownPostProcessor(createReadingModeTaskLinkProcessor(plugin))`

5. **建立 `src/ui/TaskCard.ts` 中的 `showTaskContextMenu()`**
   - 右鍵/點擊 `ellipsis-vertical` 圖示時開啟 context menu
   - 選單包含：Edit task、Delete task、Archive task、Copy link、Mark complete/incomplete
   - **"Edit task" 點擊後開啟 `TaskEditModal` expanded split-layout**

6. **SettingsTab 加入開關**
   - `enableTaskLinkOverlay: boolean`（預設 `true`）
   - 位置：Features tab 或 General tab

7. **CSS 樣式**
   - `.task-card__status-dot` — 狀態彩色小圓點（`border: 2px solid statusConfig.color`）
   - `.task-card__context-menu` — 三個點按鈕（`ellipsis-vertical` icon）
   - `.task-card__priority-dot` — 優先順序小圓點
   - `.task-inline-preview--reading-mode` — 閱讀模式專用

### 預估複雜度：**高**
- 需要深度整合 CodeMirror ViewPlugin API
- 效能優化（debounce、懶加載）
- 需與 TaskService/CacheManager 整合取得任務資訊

### 建議順序
- Step 1 → 2 → 3 → 4 → 5 → 6 → 7（依賴鏈清晰）
- Step 5（showTaskContextMenu + 開啟 expanded split-layout）是亮點功能

### 風險點
- **效能**：即時偵測wikilinks 需要 debounce，避免每次keystroke都全掃
- **循環依賴**：編輯任務時 TaskEditModal 更新 → emit EVENT_TASK_UPDATED → overlay 刷新 → 避免無限迴圈
- **路徑解析**：相對路徑需正確解析為絕對路徑

---

## 範疇 12：任務看板內嵌元件（Task Kanban Embed）

### 目標

在任意筆記中使用 ` ```task-kanban ``` ` code block，自動呈現該筆記的任務看板（Reading Mode），並支援拖曳任務改變狀態。

### 具體步驟

1. **建立 `src/kanban/TaskKanbanPostProcessor.ts`**
   - 實作 `MarkdownPostProcessor`（`registerMarkdownPostProcessor`）
   - 偵測 ` ```task-kanban ``` ` code block
   - 使用 `context.sourcePath` 取得所在檔案路徑
   - 用 Vanilla JS DOM 建立 `.task-kanban-wrapper`
   - 左上角 grip-horizontal 拖曳手柄
   - 標題列「📋 任務看板」

2. **建立 `src/kanban/TaskKanbanView.ts`**（Vanilla JS，無 React 依賴）
   - 四欄：To Do、In Progress、Done、Cancelled
   - 每欄用 `TaskService.getAllTasks()` + `path === sourcePath` 過濾
   - HTML5 Drag & Drop 拖曳卡片改變狀態
   - 優先順序左框線顏色（urgent=紫、high=紅、medium=橙、low=綠、none=灰）
   - 點擊卡片 → 開啟 `TaskEditModal`

3. **拖曳手柄移動面板**
   - 滑鼠按住 grip 圖示 → 拖曳到新位置 → 寫入修改過的 markdown
   - `moveCodeBlock()` 讀取 `ctx.getSectionInfo()` 取得 block 行號
   - 與鄰近 code block 置換位置

4. **CSS 樣式（寫入 `styles.css`）**
   - `.task-kanban-wrapper` — 佔據 document flow（block 而非 absolute）
   - `.task-kanban-handle` — 滑鼠 hover 出現（opacity 0 → 1）
   - `.task-kanban-board` — `display: flex`，四欄橫排
   - `.task-kanban-column` — 頂部3px 彩邊，`max-height: 480px; overflow-y: auto`
   - `.task-kanban-card` — 左框線優先順序色，hover 上浮陰影
   - `body.task-kanban-dragging * { cursor: grabbing }`

5. **整合進 `src/main.ts`**
   - `this.kanbanPostProcessor = new TaskKanbanPostProcessor(this)`
   - `onunload()` 呼叫 `kanbanPostProcessor.unload()`

6. **Reading Mode 優先**
   - Live Preview（CodeMirror 6）整合複雜度高，列為 Phase 2

### 預估複雜度：**中**
- DOM + HTML5 Drag & Drop 比 React 簡單
- `getSectionInfo()` 置換 markdown 需要精確的字串處理

### 建議順序
- Step 1 → 2 → 4 → 5（Step 3 拖曳移動可後續）

### 風險點
- HTML5 Drag & Drop 在跨瀏覽器表現一致
- `getSectionInfo()` 在某些 Obsidian 版本可能行為不同

