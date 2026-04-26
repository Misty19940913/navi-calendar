import { TFile, App, Vault, CacheableMetadata, WorkspaceLeaf } from "obsidian";
import { format, parseISO, isToday, isBefore, addDays } from "date-fns";
import {
  TaskInfo,
  TaskCreationData,
  TaskEditData,
  CalendarEvent,
  NaviCalendarSettings,
} from "../types";
import NaviCalendarPlugin from "../main";

export class TaskService {
  private plugin: NaviCalendarPlugin;
  private cache: Map<string, { tasks: TaskInfo[]; timestamp: number }> = new Map();
  private cacheTTL = 30000; // 30 seconds

  constructor(plugin: NaviCalendarPlugin) {
    this.plugin = plugin;
  }

  // ── Cache ──────────────────────────────────────────────────────

  invalidateCache() {
    this.cache.clear();
  }

  // ── Get All Tasks ──────────────────────────────────────────────

  async getAllTasks(): Promise<TaskInfo[]> {
    const cacheKey = "all";
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.tasks;
    }

    const files = this.plugin.app.vault.getMarkdownFiles();
    const allTasks: TaskInfo[] = [];

    for (const file of files) {
      const tasks = await this.parseTasksFromFile(file);
      allTasks.push(...tasks);
    }

    this.cache.set(cacheKey, { tasks: allTasks, timestamp: Date.now() });
    return allTasks;
  }

  async getTasksForDateRange(start: string, end: string): Promise<TaskInfo[]> {
    const allTasks = await this.getAllTasks();
    return allTasks.filter((task) => {
      if (task.due) {
        return task.due >= start && task.due <= end;
      }
      if (task.scheduled) {
        return task.scheduled >= start && task.scheduled <= end;
      }
      return false;
    });
  }

  // ── Task Parsing ──────────────────────────────────────────────

  private async parseTasksFromFile(file: TFile): Promise<TaskInfo[]> {
    const tasks: TaskInfo[] = [];

    try {
      const content = await this.plugin.app.vault.read(file);
      const lines = content.split("\n");
      const cache = this.plugin.app.metadataCache.getFileCache(file);

      // Get task items from Obsidian's built-in parser
      const taskItems = cache?.tasks || [];
      const frontmatter = cache?.frontmatter;

      // Also parse manually for better control
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const taskMatch = line.match(/^(\s*)[-*]\s*\[([ xX\-><!])\]\s*(.+)/);

        if (taskMatch) {
          const task = this.parseTaskLine(
            taskMatch[3],
            taskMatch[2],
            file.path,
            i + 1,
            frontmatter,
            taskItems
          );
          if (task) tasks.push(task);
        }
      }
    } catch (e) {
      // File read error, skip
    }

    return tasks;
  }

  private parseTaskLine(
    raw: string,
    statusChar: string,
    path: string,
    line: number,
    frontmatter?: CacheableMetadata["frontmatter"],
    taskItems?: any[]
  ): TaskInfo | null {
    // Extract title (before any #tag or due date)
    let title = raw
      .replace(/🔁\s*.+/, "") // recurrence
      .replace(/#\S+/g, "")   // remove tags from title
      .replace(/[📅⏰🎯].*$/, "") // remove date indicators
      .trim();

    // Parse due date: 📅YYYY-MM-DD or due:YYYY-MM-DD
    let due: string | undefined;
    let scheduled: string | undefined;
    let startTime: string | undefined;
    let endTime: string | undefined;
    let recurrence: string | undefined;
    let priority: "none" | "low" | "medium" | "high" | "urgent" = "none";
    let blockedBy: string[] = [];
    let tags: string[] = [];
    let projects: string[] = [];

    // Extract inline tags
    const tagMatches = raw.match(/#[\w-]+/g);
    if (tagMatches) {
      tags = tagMatches.map((t) => t.slice(1));
    }

    // Extract project references (links to other notes)
    const projectMatches = raw.match(/\[\[([^\]]+)\]\]/g);
    if (projectMatches) {
      projects = projectMatches.map((p) => p.slice(2, -2));
    }

    // Parse emoji indicators
    const dueMatch = raw.match(/📅(\d{4}-\d{2}-\d{2})/);
    if (dueMatch) due = dueMatch[1];

    const schedMatch = raw.match(/⏰([\d:]+)/);
    if (schedMatch) scheduled = schedMatch[1];

    const timeMatch = raw.match(/⏰([\d:]+)\s*[-–]\s*([\d:]+)/);
    if (timeMatch) {
      startTime = timeMatch[1];
      endTime = timeMatch[2];
    }

    // Parse recurrence
    const recurMatch = raw.match(/🔁\s*(.+?)(?:\s+📅|$)/);
    if (recurMatch) recurrence = recurMatch[1];

    // Parse priority
    if (raw.includes("🔴") || raw.includes("❗")) priority = "high";
    else if (raw.includes("🟡") || raw.includes("❕")) priority = "medium";
    else if (raw.includes("🟢")) priority = "low";
    else if (raw.includes("🟣")) priority = "urgent";

    // Check frontmatter overrides
    if (frontmatter) {
      if (frontmatter.due && !due) due = String(frontmatter.due);
      if (frontmatter.scheduled && !scheduled) scheduled = String(frontmatter.scheduled);
      if (frontmatter.priority && priority === "none") {
        const p = String(frontmatter.priority).toLowerCase();
        if (["high", "medium", "low", "urgent", "none"].includes(p)) {
          priority = p as any;
        }
      }
      if (frontmatter.tags && tags.length === 0) {
        tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [frontmatter.tags];
      }
    }

    // Use Obsidian's task items for more accurate status detection
    const taskItem = taskItems?.find((t: any) => t.position.start.line === line - 1);

    const id = `${path}:${line}`;

    return {
      id,
      title,
      status: statusChar === " " ? "todo" : statusChar,
      priority,
      due,
      scheduled,
      startTime,
      endTime,
      path,
      line,
      recurrence,
      blockedBy,
      tags,
      projects,
    };
  }

  // ── Task CRUD ─────────────────────────────────────────────────

  async createTask(data: TaskCreationData): Promise<TaskInfo> {
    if (!this.plugin.settings.journalFolder) {
      throw new Error("Journal folder not set in settings");
    }

    const today = format(new Date(), "yyyy-MM-dd");
    const filename = `${today}.md`;
    const filePath = `${this.plugin.settings.journalFolder}${filename}`;

    let file = this.plugin.app.vault.getAbstractFileByPath(filePath);
    let content = "";

    if (file && file instanceof TFile) {
      content = await this.plugin.app.vault.read(file);
      if (!content.endsWith("\n")) content += "\n";
    } else {
      // Create new daily note file
      content = `---\ndate: ${today}\ntype: daily-note\n---\n\n`;
    }

    // Format task line
    const emojiIndicators = [];
    if (data.due) emojiIndicators.push(`📅${data.due}`);
    if (data.scheduled) emojiIndicators.push(`⏰${data.scheduled}`);
    if (data.startTime && data.endTime) {
      emojiIndicators.push(`⏰${data.startTime}-${data.endTime}`);
    } else if (data.scheduled) {
      emojiIndicators.push(`⏰${data.scheduled}`);
    }
    if (data.recurrence) emojiIndicators.push(`🔁 ${data.recurrence}`);

    const emojiStr = emojiIndicators.length > 0 ? " " + emojiIndicators.join(" ") : "";

    let taskLine = `- [ ] ${data.title}${emojiStr}`;
    if (data.tags && data.tags.length > 0) {
      taskLine += " " + data.tags.map((t) => `#${t}`).join(" ");
    }
    taskLine += "\n";

    // Append to file
    await this.plugin.app.vault.modify(file as TFile, content + taskLine);

    // Return created task
    const tasks = await this.getAllTasks();
    const created = tasks.find(
      (t) => t.title === data.title && t.path === filePath
    );
    if (!created) {
      // Fallback: return a constructed task
      return {
        id: `${filePath}:${(content.split("\n").length)}`,
        title: data.title,
        status: "todo",
        priority: data.priority || "none",
        due: data.due,
        scheduled: data.scheduled,
        path: filePath,
        line: content.split("\n").length - 1,
        tags: data.tags,
      };
    }
    return created;
  }

  async updateTask(
    id: string,
    data: TaskEditData
  ): Promise<TaskInfo> {
    // Parse id: "path:line"
    const colonIdx = id.lastIndexOf(":");
    const filePath = id.substring(0, colonIdx);
    const lineNum = parseInt(id.substring(colonIdx + 1));

    const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
      throw new Error(`File not found: ${filePath}`);
    }

    let content = await this.plugin.app.vault.read(file);
    const lines = content.split("\n");

    if (lineNum < 1 || lineNum > lines.length) {
      throw new Error(`Line ${lineNum} out of range in ${filePath}`);
    }

    let line = lines[lineNum - 1];

    // Handle completion toggle
    if (data.completed !== undefined) {
      if (data.completed) {
        // Mark as done: - [ ] → - [x]
        line = line.replace(/^(\s*[-*]\s*\[)\s*(\])/, "$1x$2");
        // Add completed date if not present
        const today = format(new Date(), "yyyy-MM-dd");
        if (!line.includes("✅")) {
          line += ` ✅${today}`;
        }
      } else {
        // Mark as todo: - [x] → - [ ]
        line = line.replace(/^(\s*[-*]\s*\[)[xX](\])/, "$1 $2");
      }
    }

    // Handle due date update
    if (data.due !== undefined) {
      // Remove existing due indicator
      line = line.replace(/\s*📅[\d\-]+/, "");
      // Add new due
      if (data.due) {
        line += ` 📅${data.due}`;
      }
    }

    // Handle scheduled date update
    if (data.scheduled !== undefined) {
      line = line.replace(/\s*⏰[\d:]+/, "");
      if (data.scheduled) {
        line += ` ⏰${data.scheduled}`;
      }
    }

    // Handle priority update
    if (data.priority !== undefined) {
      // Remove existing priority emojis
      line = line.replace(/\s*[🔴🟡🟢🟣❗❕]/, "");
      const priorityEmoji: Record<string, string> = {
        high: " 🔴",
        medium: " 🟡",
        low: " 🟢",
        urgent: " 🟣",
      };
      if (data.priority && priorityEmoji[data.priority]) {
        line += priorityEmoji[data.priority];
      }
    }

    lines[lineNum - 1] = line;
    await this.plugin.app.vault.modify(file, lines.join("\n"));

    // Return updated task
    const tasks = await this.getAllTasks();
    const updated = tasks.find((t) => t.id === id);
    if (!updated) {
      throw new Error(`Task not found after update: ${id}`);
    }
    return updated;
  }

  async deleteTask(id: string): Promise<void> {
    const colonIdx = id.lastIndexOf(":");
    const filePath = id.substring(0, colonIdx);
    const lineNum = parseInt(id.substring(colonIdx + 1));

    const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
      throw new Error(`File not found: ${filePath}`);
    }

    let content = await this.plugin.app.vault.read(file);
    const lines = content.split("\n");

    if (lineNum < 1 || lineNum > lines.length) {
      throw new Error(`Line ${lineNum} out of range`);
    }

    // Remove the task line
    lines.splice(lineNum - 1, 1);
    await this.plugin.app.vault.modify(file, lines.join("\n"));
  }

  // ── Find Tasks ────────────────────────────────────────────────

  async findTasks(query: string): Promise<TaskInfo[]> {
    const allTasks = await this.getAllTasks();
    const lower = query.toLowerCase();

    return allTasks.filter(
      (t) =>
        t.title.toLowerCase().includes(lower) ||
        t.path.toLowerCase().includes(lower)
    );
  }

  async findTaskById(id: string): Promise<TaskInfo | null> {
    const allTasks = await this.getAllTasks();
    return allTasks.find((t) => t.id === id) || null;
  }

  // ── Calendar Events ───────────────────────────────────────────

  async getCalendarEvents(start: string, end: string): Promise<CalendarEvent[]> {
    const tasks = await this.getTasksForDateRange(start, end);
    const events: CalendarEvent[] = [];

    for (const task of tasks) {
      // Due date events
      if (task.due && this.plugin.settings.showDue) {
        events.push(this.taskToCalendarEvent(task, "due"));
      }

      // Scheduled date events
      if (task.scheduled && this.plugin.settings.showScheduled) {
        // Avoid double-counting if due === scheduled
        if (!task.due || task.scheduled !== task.due) {
          events.push(this.taskToCalendarEvent(task, "scheduled"));
        }
      }
    }

    return events;
  }

  private taskToCalendarEvent(
    task: TaskInfo,
    dateType: "due" | "scheduled"
  ): CalendarEvent {
    const date = dateType === "due" ? task.due! : task.scheduled!;

    // Determine colors based on priority and status
    const colors = this.getTaskColors(task);

    // Check if it's a timeblock (has start/end time)
    const isTimeblock = !!(task.startTime && task.endTime);

    return {
      id: `${task.id}:${dateType}`,
      title: task.title,
      start: isTimeblock && task.startTime ? `${date}T${task.startTime}` : date,
      end: isTimeblock && task.endTime ? `${date}T${task.endTime}` : undefined,
      allDay: !isTimeblock,
      backgroundColor: colors.background,
      borderColor: colors.border,
      textColor: colors.text,
      extendedProps: {
        task,
        isTimeblock,
        isRecurring: !!task.recurrence,
        isBlocked: task.isBlocked || false,
      },
      editable: !task.isBlocked,
      durationEditable: isTimeblock,
      startEditable: !task.isBlocked,
    };
  }

  private getTaskColors(task: TaskInfo): {
    background: string;
    border: string;
    text: string;
  } {
    const settings = this.plugin.settings;
    const today = format(new Date(), "yyyy-MM-dd");

    // Overdue
    if (task.due && task.due < today && task.status !== "x") {
      return {
        background: settings.overdueColor,
        border: settings.overdueColor,
        text: "#ffffff",
      };
    }

    // Blocked
    if (task.isBlocked) {
      return {
        background: settings.blockedColor,
        border: settings.blockedColor,
        text: "#ffffff",
      };
    }

    // Priority-based
    switch (task.priority) {
      case "urgent":
        return {
          background: settings.priorityUrgentColor,
          border: settings.priorityUrgentColor,
          text: "#ffffff",
        };
      case "high":
        return {
          background: settings.priorityHighColor,
          border: settings.priorityHighColor,
          text: "#ffffff",
        };
      case "medium":
        return {
          background: settings.priorityMediumColor,
          border: settings.priorityMediumColor,
          text: "#ffffff",
        };
      case "low":
        return {
          background: settings.priorityLowColor,
          border: settings.priorityLowColor,
          text: "#ffffff",
        };
      default:
        return {
          background: "#4a5568",
          border: "#2d3748",
          text: "#ffffff",
        };
    }
  }

  // ── Daily Note ────────────────────────────────────────────────

  async ensureDailyNote(date: string): Promise<TFile> {
    const { app, settings } = this.plugin;
    const folder = settings.journalFolder || "journal/";
    const filename = `${date}.md`;
    const filePath = `${folder}${filename}`;

    let file = app.vault.getAbstractFileByPath(filePath);

    if (!file) {
      // Create the daily note
      file = await app.vault.create(
        filePath,
        `---\ndate: ${date}\ntype: daily-note\n---\n\n# ${format(parseISO(date), "MMMM d, yyyy")}\n\n`
      );
    }

    return file as TFile;
  }

  async openDailyNote(date: string, direction?: string) {
    const file = await this.ensureDailyNote(date);
    const { workspace } = this.plugin.app;

    let leaf: WorkspaceLeaf;

    if (direction === "split-right" || direction === "split-bottom") {
      // Legacy: shift-click opens new tab (backward compat)
      leaf = workspace.getLeaf("tab");
    } else if (direction === "new-tab") {
      leaf = workspace.getLeaf("tab");
    } else {
      // "replace" or default: reuse active leaf or create one
      leaf = workspace.getActiveLeaf() || workspace.getLeaf(false);
    }

    await leaf.openFile(file);
  }
}
