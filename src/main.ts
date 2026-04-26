import {
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  WorkspaceLeaf,
  TFile,
  Menu,
} from "obsidian";
import { format } from "date-fns";
import {
  CALENDAR_VIEW_TYPE,
  TIMELINE_VIEW_TYPE,
  MINI_CALENDAR_VIEW_TYPE,
  EVENT_DATA_CHANGED,
  EVENT_TASK_UPDATED,
  EVENT_TASK_CREATED,
  EVENT_TASK_DELETED,
  DEFAULT_SETTINGS,
  NaviCalendarSettings,
} from "./types";
import { CalendarView } from "./views/CalendarView";
import { TimelineView } from "./views/TimelineView";
import { MiniCalendarView } from "./views/MiniCalendarView";
import { TaskService } from "./services/TaskService";
import { ViewStateManager } from "./services/ViewStateManager";
import { SettingsTab } from "./settings/SettingsTab";

// ── AI Command Handler Interface ───────────────────────────────
export interface AICommandHandler {
  name: string;
  description: string;
  execute: (args: {
    plugin: NaviCalendarPlugin;
    taskService: TaskService;
    message: string;
  }) => Promise<string>;
}

// ── Main Plugin Class ─────────────────────────────────────────
export default class NaviCalendarPlugin extends Plugin {
  // Settings
  settings!: NaviCalendarSettings;

  // Services
  taskService!: TaskService;
  viewStateManager!: ViewStateManager;
  aiCommandHandlers: AICommandHandler[] = [];

  // Event emitter replacements
  private _dataChangedEmitter: Map<string, number> = new Map();

  // Status bar
  statusBar!: HTMLElement;

  // Calendar leaf references
  private mainCalendarLeaf: WorkspaceLeaf | null = null;

  // ── Lifecycle ────────────────────────────────────────────────

  async onload() {
    console.log("[navi-calendar] Loading Navi Calendar Plugin...");

    await this.loadSettings();
    this.validateRequiredSettings();

    // Initialize services
    this.taskService = new TaskService(this);
    this.viewStateManager = new ViewStateManager(this);

    // Register views
    // Register views — all factories receive only (leaf), plugin accessed via this.app.plugins
    this.registerView(CALENDAR_VIEW_TYPE, (leaf) => {
      console.log("[navi-calendar] registerView CALENDAR_VIEW_TYPE called, leaf:", leaf);
      const view = new CalendarView(leaf, this);
      console.log("[navi-calendar] CalendarView instance created:", view);
      return view;
    });

    this.registerView(TIMELINE_VIEW_TYPE, (leaf) => {
      return new TimelineView(leaf, this);
    });

    this.registerView(MINI_CALENDAR_VIEW_TYPE, (leaf) => {
      return new MiniCalendarView(leaf, this);
    });

    // Register commands
    this.registerCommands();

    // Register event handlers for data changes
    this.registerVaultEventHandlers();

    // Add settings tab
    this.addSettingTab(new SettingsTab(this));

    // ── Ribbon Icon ────────────────────────────────────────────────
    this.addRibbonIcon('calendar', 'Open Calendar', () => {
      this.activateMainCalendarView();
    });

    // ── Status Bar ────────────────────────────────────────────────
    this.statusBar = this.addStatusBarItem();
    this.statusBar.setText('📅 Navi Calendar');

    // Register AI command handlers
    this.registerAICommands();

    // Defer opening main calendar view until workspace is ready
    // (calling getLeaf during onload can fail with "No tab group found")
    this.app.workspace.onLayoutReady(() => {
      // Only auto-open if user preference is set
      // For now, just log ready state — user clicks ribbon to open
      console.log("[navi-calendar] Plugin ready. Click the 📅 ribbon icon to open calendar.");
    });

    console.log("[navi-calendar] Loaded successfully.");
  }

  onunload() {
    console.log("[navi-calendar] Unloading...");
    // Close all leaves
    this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE).forEach((leaf) => {
      leaf.detach();
    });
    this.app.workspace.getLeavesOfType(TIMELINE_VIEW_TYPE).forEach((leaf) => {
      leaf.detach();
    });
    this.app.workspace.getLeavesOfType(MINI_CALENDAR_VIEW_TYPE).forEach((leaf) => {
      leaf.detach();
    });
  }

  // ── Settings ─────────────────────────────────────────────────

  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData()
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.triggerDataChanged();
  }

  private validateRequiredSettings() {
    if (!this.settings.journalFolder) {
      new Notice(
        "⚠️ Navi Calendar: Please set the Journal folder path in Settings.",
        8000
      );
    }
  }

  // ── Commands ─────────────────────────────────────────────────

  private registerCommands() {
    // Open main calendar
    this.addCommand({
      id: "open-calendar",
      name: "Open Calendar",
      callback: () => this.activateMainCalendarView(),
    });

    // Open timeline
    this.addCommand({
      id: "open-timeline",
      name: "Open Timeline",
      callback: () => this.activateTimelineView(),
    });

    // Open mini calendar
    this.addCommand({
      id: "open-mini-calendar",
      name: "Open Mini Calendar",
      callback: () => this.activateMiniCalendarView(),
    });

    // Refresh
    this.addCommand({
      id: "refresh-calendar",
      name: "Refresh Calendar",
      callback: () => this.triggerDataChanged(),
    });
  }

  // ── Vault Event Handlers ──────────────────────────────────────

  private registerVaultEventHandlers() {
    // File create
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile && this.isRelevantFile(file)) {
          this.triggerDataChanged();
        }
      })
    );

    // File modify
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && this.isRelevantFile(file)) {
          this.triggerDataChanged();
        }
      })
    );

    // File delete
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile && this.isRelevantFile(file)) {
          this.triggerDataChanged();
        }
      })
    );

    // Metadata changes (task status, frontmatter)
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (this.isRelevantFile(file)) {
          this.triggerDataChanged();
        }
      })
    );
  }

  private isRelevantFile(file: TFile): boolean {
    if (!this.settings.journalFolder) return true;
    return file.path.startsWith(this.settings.journalFolder);
  }

  // ── View Activation ──────────────────────────────────────────

  activateMainCalendarView(date?: string) {
    const { workspace } = this.app;

    // Reuse existing leaf
    const existing = workspace.getLeavesOfType(CALENDAR_VIEW_TYPE);
    if (existing.length > 0) {
      workspace.setActiveLeaf(existing[0]);
      const view = existing[0].view as CalendarView;
      if (date) view.gotoDate(date);
      return;
    }

    const dir = this.settings.openDirection;

    // All modes use onLayoutReady to avoid "No tab group found"
    workspace.onLayoutReady(() => {
      this.doActivateMainCalendarView(date);
    });
  }

  private doActivateMainCalendarView(date?: string) {
    const { workspace } = this.app;
    const dir = this.settings.openDirection;

    let leaf = workspace.getLeavesOfType(CALENDAR_VIEW_TYPE)[0];
    if (leaf) {
      workspace.setActiveLeaf(leaf);
      return;
    }

    if (dir === "new-tab") {
      // getLeaf("tab") opens a NEW tab in the main content area
      leaf = workspace.getLeaf("tab");
    } else {
      // "replace" — use active leaf or create one without splitting
      leaf = workspace.getActiveLeaf() || workspace.getLeaf(false);
    }

    if (!leaf) {
      console.error("[navi-calendar] Could not get leaf for calendar");
      return;
    }

    leaf.setViewState({
      type: CALENDAR_VIEW_TYPE,
      state: date ? { date } : {},
    });
    this.mainCalendarLeaf = leaf;

    if (dir === "new-tab") {
      workspace.setActiveLeaf(leaf);
    }
  }

  activateTimelineView(date?: string) {
    const existing = this.app.workspace.getLeavesOfType(TIMELINE_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.setActiveLeaf(existing[0]);
      return;
    }

    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      leaf.setViewState({
        type: TIMELINE_VIEW_TYPE,
        state: date ? { date } : {},
      });
    }
  }

  activateMiniCalendarView() {
    const existing = this.app.workspace.getLeavesOfType(MINI_CALENDAR_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.setActiveLeaf(existing[0]);
      return;
    }

    const sidebar = this.settings.miniCalendarSidebar;
    const preferredLeaf = sidebar === "left"
      ? this.app.workspace.getLeftLeaf(false)
      : this.app.workspace.getRightLeaf(false);

    // Fallback: if preferred sidebar is closed (leaf is null), try opposite
    const leaf = preferredLeaf
      || (sidebar === "left"
          ? this.app.workspace.getRightLeaf(false)
          : this.app.workspace.getLeftLeaf(false));

    if (leaf) {
      leaf.setViewState({ type: MINI_CALENDAR_VIEW_TYPE });
    } else {
      console.warn("[navi-calendar] Could not open mini calendar: both sidebars are closed");
    }
  }

  // ── Data Change Notification ────────────────────────────────

  triggerDataChanged() {
    this._dataChangedEmitter.set("data", Date.now());
    this.app.workspace.trigger(EVENT_DATA_CHANGED);
    // Also notify task service
    this.taskService?.invalidateCache();
  }

  // ── AI Command System ────────────────────────────────────────

  registerAICommandHandler(handler: AICommandHandler) {
    this.aiCommandHandlers.push(handler);
  }

  async executeAICommand(message: string): Promise<string> {
    if (!message.trim()) {
      return "Please provide a command. Example: 'Add task: Buy groceries due tomorrow'";
    }

    // ── Parse command ──────────────────────────────────────────
    // Pattern: "add task: <title> due <date>" / "create task: ... scheduled <date>"
    const addMatch = message.match(
      /^(?:add|create|new)\s+task:?\s+(.+)/i
    );
    if (addMatch) {
      return await this.handleAddTask(addMatch[1]);
    }

    // Pattern: "edit task <title>: set due <date>"
    const editMatch = message.match(
      /^edit\s+task\s+["']?(.+?)["']?\s*[:\-]?\s*(.+)/i
    );
    if (editMatch) {
      return await this.handleEditTask(editMatch[1], editMatch[2]);
    }

    // Pattern: "delete task <title>"
    const deleteMatch = message.match(
      /^delete\s+(?:task\s+)?["']?(.+?)["']?$/i
    );
    if (deleteMatch) {
      return await this.handleDeleteTask(deleteMatch[1]);
    }

    // Pattern: "complete task <title>"
    const completeMatch = message.match(
      /^(?:complete|finish|done|check)\s+(?:task\s+)?["']?(.+?)["']?$/i
    );
    if (completeMatch) {
      return await this.handleCompleteTask(completeMatch[1]);
    }

    // Pattern: "move task <title> to <date>"
    const moveMatch = message.match(
      /^move\s+(?:task\s+)?["']?(.+?)["']?\s+(?:to|on|at)\s+(.+)$/i
    );
    if (moveMatch) {
      return await this.handleMoveTask(moveMatch[1], moveMatch[2]);
    }

    // Fallback: try AI command handlers
    for (const handler of this.aiCommandHandlers) {
      try {
        const result = await handler.execute({
          plugin: this,
          taskService: this.taskService,
          message,
        });
        if (result) return result;
      } catch (e) {
        // Continue to next handler
      }
    }

    return `Could not understand command. Try:\n` +
      `• "Add task: Buy groceries due tomorrow"\n` +
      `• "Edit task 'Report': set due 2026-05-01"\n` +
      `• "Complete task 'Report'"\n` +
      `• "Move task 'Meeting' to 2026-05-01"`;
  }

  // ── AI Task Command Handlers ──────────────────────────────────

  private async handleAddTask(taskString: string): Promise<string> {
    // Parse: "Buy groceries due tomorrow" or "Meeting with John at 3pm on 2026-05-01"
    const dueMatch = taskString.match(/due\s+(.+?)(?:\s+scheduled|$)/i);
    const scheduledMatch = taskString.match(/scheduled\s+(.+?)(?:\s+due|$)/i);

    // Use chrono-node for natural date parsing if available, otherwise simple parse
    let due: string | undefined;
    let scheduled: string | undefined;

    if (dueMatch) {
      due = this.parseNaturalDate(dueMatch[1]);
    }
    if (scheduledMatch) {
      scheduled = this.parseNaturalDate(scheduledMatch[1]);
    }

    // Title is everything before "due" or "scheduled"
    let title = taskString
      .replace(/due\s+.+?(?:\s+scheduled|$)/i, "")
      .replace(/scheduled\s+.+?(?:\s+due|$)/i, "")
      .trim();

    const task = await this.taskService.createTask({
      title,
      due,
      scheduled,
    });

    this.triggerDataChanged();

    return `✅ Task created: **${task.title}**\n` +
      (task.due ? `📅 Due: ${task.due}\n` : "") +
      (task.scheduled ? `⏰ Scheduled: ${task.scheduled}\n` : "") +
      `📁 File: ${task.path}`;
  }

  private async handleEditTask(
    taskTitle: string,
    editString: string
  ): Promise<string> {
    const tasks = await this.taskService.findTasks(taskTitle);
    if (tasks.length === 0) {
      return `❌ No task found matching "${taskTitle}"`;
    }
    if (tasks.length > 1) {
      return `⚠️ Multiple tasks match "${taskTitle}":\n` +
        tasks.map((t, i) => `${i + 1}. ${t.title} (${t.path})`).join("\n") +
        `\n\nPlease be more specific.`;
    }

    const task = tasks[0];
    let due: string | undefined;
    let scheduled: string | undefined;
    let priority: string | undefined;

    const dueMatch = editString.match(/due\s+(.+?)(?:\s+scheduled|$)/i);
    const schedMatch = editString.match(/scheduled\s+(.+?)(?:\s+due|$)/i);
    const priorityMatch = editString.match(/priority\s+(high|medium|low|urgent|none)/i);

    if (dueMatch) due = this.parseNaturalDate(dueMatch[1]);
    if (schedMatch) scheduled = this.parseNaturalDate(schedMatch[1]);
    if (priorityMatch) priority = priorityMatch[1];

    const updated = await this.taskService.updateTask(task.id, {
      due,
      scheduled,
      priority: priority as any,
    });

    this.triggerDataChanged();

    return `✅ Task updated: **${updated.title}**\n` +
      (updated.due ? `📅 Due: ${updated.due}\n` : "") +
      (updated.scheduled ? `⏰ Scheduled: ${updated.scheduled}\n` : "");
  }

  private async handleCompleteTask(taskTitle: string): Promise<string> {
    const tasks = await this.taskService.findTasks(taskTitle);
    if (tasks.length === 0) {
      return `❌ No task found matching "${taskTitle}"`;
    }

    const task = tasks[0];
    const updated = await this.taskService.updateTask(task.id, {
      completed: true,
    });

    this.triggerDataChanged();

    return `✅ Task completed: **${updated.title}**`;
  }

  private async handleDeleteTask(taskTitle: string): Promise<string> {
    const tasks = await this.taskService.findTasks(taskTitle);
    if (tasks.length === 0) {
      return `❌ No task found matching "${taskTitle}"`;
    }

    const task = tasks[0];
    await this.taskService.deleteTask(task.id);
    this.triggerDataChanged();

    return `🗑️ Task deleted: **${task.title}**`;
  }

  private async handleMoveTask(
    taskTitle: string,
    dateString: string
  ): Promise<string> {
    const tasks = await this.taskService.findTasks(taskTitle);
    if (tasks.length === 0) {
      return `❌ No task found matching "${taskTitle}"`;
    }

    const task = tasks[0];
    const newDate = this.parseNaturalDate(dateString);
    const updated = await this.taskService.updateTask(task.id, {
      due: newDate,
    });

    this.triggerDataChanged();

    return `📅 Task moved: **${updated.title}** → ${newDate}`;
  }

  // ── Natural Date Parser ──────────────────────────────────────
  // Simple parser for common date patterns. Replace with chrono-node for production.

  parseNaturalDate(dateStr: string): string {
    const d = dateStr.trim().toLowerCase();

    // today
    if (d === "today") {
      return format(new Date(), "yyyy-MM-dd");
    }

    // tomorrow
    if (d === "tomorrow") {
      const t = new Date();
      t.setDate(t.getDate() + 1);
      return format(t, "yyyy-MM-dd");
    }

    // next week
    if (d === "next week") {
      const t = new Date();
      t.setDate(t.getDate() + 7);
      return format(t, "yyyy-MM-dd");
    }

    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return d;
    }

    // YYYY/MM/DD
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(d)) {
      return d.replace(/\//g, "-");
    }

    // MM-DD or MM/DD (current year)
    const shortMatch = d.match(/^(\d{1,2})[-\/](\d{1,2})$/);
    if (shortMatch) {
      const year = new Date().getFullYear();
      const m = shortMatch[1].padStart(2, "0");
      const day = shortMatch[2].padStart(2, "0");
      return `${year}-${m}-${day}`;
    }

    // Relative days: "in 3 days", "in 2 weeks"
    const inMatch = d.match(/^in\s+(\d+)\s+(day|days|week|weeks)$/);
    if (inMatch) {
      const num = parseInt(inMatch[1]);
      const unit = inMatch[2];
      const t = new Date();
      if (unit.startsWith("day")) t.setDate(t.getDate() + num);
      else t.setDate(t.getDate() + num * 7);
      return format(t, "yyyy-MM-dd");
    }

    // Fallback: try Date.parse
    const parsed = Date.parse(d);
    if (!isNaN(parsed)) {
      return format(new Date(parsed), "yyyy-MM-dd");
    }

    // Return as-is (let TaskService handle it)
    return dateStr;
  }

  // ── AI Command Registration ──────────────────────────────────

  private registerAICommands() {
    // This is called by external AI systems (like Hermes)
    // to register additional command handlers
    console.log("[navi-calendar] AI command system ready");
  }
}

// ── Helper: Open Settings Tab ────────────────────────────────
export function openCalendarSettings(plugin: NaviCalendarPlugin) {
  plugin.addSettingTab(new SettingsTab(plugin));
}
