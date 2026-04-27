import { TFile, App, Vault, CachedMetadata, WorkspaceLeaf } from "obsidian";
import { format, parseISO, isToday, isBefore, addDays } from "date-fns";
import {
  TaskInfo,
  TaskCreationData,
  TaskEditData,
  CalendarEvent,
  NaviCalendarSettings,
  TaskPriority,
  TaskDependency,
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

      // Get task items from Obsidian's built-in parser (tasks exist in cache.lists for Tasks plugin compatibility)
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
            frontmatter
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
    frontmatter?: CachedMetadata["frontmatter"]
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
    if (data.startTime && data.endTime) {
      emojiIndicators.push(`⏰${data.startTime}-${data.endTime}`);
    } else if (data.scheduled) {
      emojiIndicators.push(`⏰${data.scheduled}`);
    }
    if (data.recurrence) emojiIndicators.push(`🔁${data.recurrence}`);

    const emojiStr = emojiIndicators.length > 0 ? " " + emojiIndicators.join(" ") : "";

    let taskLine = `- [ ] ${data.title}${emojiStr}`;
    if (data.tags && data.tags.length > 0) {
      taskLine += " " + data.tags.map((t) => `#${t}`).join(" ");
    }
    taskLine += "\n";

    // Append to file
    if (file && file instanceof TFile) {
      await this.plugin.app.vault.modify(file, content + taskLine);
    } else {
      await this.plugin.app.vault.create(filePath, content + taskLine);
    }

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

  // ── File-based Task Creation ─────────────────────────────────

  async createTaskAsFile(data: {
    title: string;
    scheduled?: string;
    due?: string;
    startTime?: string;
    endTime?: string;
    priority?: TaskPriority;
    tags?: string[];
  }): Promise<TaskInfo | null> {
    const { app, settings } = this.plugin;
    
    // 1. Determine folder
    const folder = settings.taskFolder || "tasks/";
    const normalizedFolder = folder.endsWith("/") ? folder : folder + "/";
    
    // 2. Read template if path is set and file exists
    let content = "";
    if (settings.taskTemplatePath) {
      try {
        content = await app.vault.adapter.read(settings.taskTemplatePath);
        // Process template variables
        const now = new Date().toISOString();
        content = content
          .replace(/\{\{date\}\}/g, now.split("T")[0])
          .replace(/\{\{time_created\}\}/g, now)
          .replace(/\{\{title\}\}/g, data.title);
      } catch (err) {
        // Template file not found, use default
        console.warn(`[NaviCalendar] Task template not found or unreadable: "${settings.taskTemplatePath}"`, err);
        content = "";
      }
    }
    
    // 3. Build frontmatter
    const frontmatter: Record<string, any> = {
      type: "task",
      status: " ",
      time_created: new Date().toISOString(),
    };
    if (data.scheduled) frontmatter.scheduled = data.scheduled;
    if (data.due) frontmatter.due = data.due;
    if (data.startTime) frontmatter.startTime = data.startTime;
    if (data.endTime) frontmatter.endTime = data.endTime;
    if (data.priority) frontmatter.priority = data.priority;
    if (data.tags && data.tags.length > 0) frontmatter.tags = data.tags;

    // 4. Serialize frontmatter (YAML style: arrays inline with # prefix, strings unquoted)
    const fmLines = Object.entries(frontmatter)
      .map(([k, v]) => {
        if (Array.isArray(v)) {
          return `${k}: [${v.map((item) => `#${item}`).join(", ")}]`;
        } else if (typeof v === "string") {
          return `${k}: "${v}"`;
        } else {
          return `${k}: ${JSON.stringify(v)}`;
        }
      })
      .join("\n");
    
    // 5. Build file content
    const body = content.trim() ? `\n\n${content.trim()}` : "";
    const fileContent = `---\n${fmLines}\n---\n# ${data.title}${body}`;
    
    // 6. Generate filename
    const slug = data.title
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 50);
    const filename = `${slug}-${Date.now()}.md`;
    const filePath = `${normalizedFolder}${filename}`;
    
    // 7. Ensure folder exists
    try {
      await app.vault.adapter.mkdir(normalizedFolder);
    } catch { /* already exists */ }
    
    // 8. Create file
    try {
      await app.vault.adapter.write(filePath, fileContent);
      
      return {
        id: `${filePath}:0`,
        title: data.title,
        status: " ",
        priority: "none" as TaskPriority,
        scheduled: data.scheduled,
        due: data.due,
        path: filePath,
        line: 1,
      };
    } catch (err) {
      console.error("[NaviCalendar] createTask error:", err);
      return null;
    }
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

    // Handle title update — modify the task line text
    if (data.title !== undefined) {
      // Replace the task text between checkbox and any emoji markers
      // Pattern: `- [ ] Title...` or `- [x] Title...`
      const taskTextMatch = line.match(/^(\s*[-*]\s*\[[ xX\->!]\]\s*)(.*)/);
      if (taskTextMatch) {
        // Keep the checkbox prefix, replace the rest
        // Strip old title and emoji indicators, keep tags
        const oldText = taskTextMatch[2];
        // Preserve inline tags at the end
        const tagsMatch = oldText.match(/(\s+#[\w\-]+)*$/);
        const tags = tagsMatch ? tagsMatch[0] : "";
        lines[lineNum - 1] = `${taskTextMatch[1]}${data.title}${tags}`;
      }
    }

    // Handle completion toggle
    if (data.completed !== undefined) {
      if (data.completed) {
        // Mark as done: - [ ] → - [x]
        lines[lineNum - 1] = lines[lineNum - 1].replace(/^(\s*[-*]\s*\[)\s*(\])/, "$1x$2");
        // Add completed date if not present
        const today = format(new Date(), "yyyy-MM-dd");
        if (!lines[lineNum - 1].includes("✅")) {
          lines[lineNum - 1] += ` ✅${today}`;
        }
      } else {
        // Mark as todo: - [x] → - [ ]
        lines[lineNum - 1] = lines[lineNum - 1].replace(/^(\s*[-*]\s*\[)[xX](\])/, "$1 $2");
      }
    }

    // Handle due date update
    if (data.due !== undefined) {
      // Remove existing due indicator
      lines[lineNum - 1] = lines[lineNum - 1].replace(/\s*📅[\d\-]+/, "");
      // Add new due
      if (data.due) {
        lines[lineNum - 1] += ` 📅${data.due}`;
      }
    }

    // Handle scheduled date update
    if (data.scheduled !== undefined) {
      lines[lineNum - 1] = lines[lineNum - 1].replace(/\s*⏰[\d:]+/, "");
      if (data.scheduled) {
        lines[lineNum - 1] += ` ⏰${data.scheduled}`;
      }
    }

    // Handle priority update
    if (data.priority !== undefined) {
      // Remove existing priority emojis
      lines[lineNum - 1] = lines[lineNum - 1].replace(/\s*(?:🔴|🟡|🟢|🟣|❗|❕)/g, "");
      const priorityEmoji: Record<string, string> = {
        high: " 🔴",
        medium: " 🟡",
        low: " 🟢",
        urgent: " 🟣",
      };
      if (data.priority && priorityEmoji[data.priority]) {
        lines[lineNum - 1] += priorityEmoji[data.priority];
      }
    }

    // ── Handle frontmatter fields ────────────────────────────────
    // Find frontmatter boundaries (lines between opening/closing ---)
    let fmStart = -1;
    let fmEnd = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]?.trim() === "---") {
        if (fmStart === -1) fmStart = i;
        else { fmEnd = i; break; }
      }
    }

    // Helper: update or append a frontmatter key
    const updateFm = (key: string, value: any) => {
      if (fmStart === -1 || fmEnd === -1) return; // No frontmatter block
      if (value === undefined || value === null) return; // Skip null/undefined
      const pattern = new RegExp(`^(\\s*)${key}:\\s*`);
      let found = false;
      for (let i = fmStart + 1; i < fmEnd; i++) {
        const m = lines[i].match(pattern);
        if (m) {
          // Format: arrays inline with # prefix, strings double-quoted, others JSON
          if (Array.isArray(value)) {
            lines[i] = `${m[1]}${key}: [${value.map((item) => `#${item}`).join(", ")}]`;
          } else if (typeof value === "string") {
            lines[i] = `${m[1]}${key}: "${value}"`;
          } else {
            lines[i] = `${m[1]}${key}: ${JSON.stringify(value)}`;
          }
          found = true;
          break;
        }
      }
      if (!found) {
        // Append before fmEnd (the closing ---), YAML inline format
        let newLine: string;
        if (Array.isArray(value)) {
          newLine = `  ${key}: [${value.map((item) => `#${item}`).join(", ")}]`;
        } else if (typeof value === "string") {
          newLine = `  ${key}: "${value}"`;
        } else {
          newLine = `  ${key}: ${JSON.stringify(value)}`;
        }
        lines.splice(fmEnd, 0, newLine);
        fmEnd++;
      }
    };

    if (data.blockedBy !== undefined) updateFm("blockedBy", data.blockedBy);
    if (data.blocking !== undefined) updateFm("blocking", data.blocking);
    if (data.subtasks !== undefined) updateFm("subtasks", data.subtasks);
    if (data.projects !== undefined) updateFm("projects", data.projects);
    if (data.startTime !== undefined) updateFm("startTime", data.startTime);
    if (data.endTime !== undefined) updateFm("endTime", data.endTime);

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
      let content = "";
      const templatePath = settings.journalTemplatePath;

      if (templatePath) {
        const templateFile = app.vault.getAbstractFileByPath(templatePath);
        if (templateFile && templateFile instanceof TFile) {
          content = await app.vault.read(templateFile);
        }
      }

      // Fallback minimal content
      if (!content) {
        content = `---\ndate: ${date}\ntype: daily-note\n---\n\n# ${format(parseISO(date), "MMMM d, yyyy")}\n\n`;
      } else {
        // Resolve template variables
        const title = format(parseISO(date), "MMMM d, yyyy");
        const timeCreated = new Date().toISOString();
        content = content
          .replace(/\{\{date\}\}/g, date)
          .replace(/\{\{title\}\}/g, title)
          .replace(/\{\{time_created\}\}/g, timeCreated);
      }

      file = await app.vault.create(filePath, content);
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
      leaf = workspace.activeLeaf || workspace.getLeaf(false);
    }

    await leaf.openFile(file);
  }

  // ── Dependency Management ──────────────────────────────────────

  /**
   * Get a task by its UID (unique identifier path:line)
   */
  async getTaskByUid(uid: string): Promise<TaskInfo | null> {
    const allTasks = await this.getAllTasks();
    return allTasks.find(t => t.id === uid) || null;
  }

  /**
   * Get task dependencies (both blockedBy and blocking)
   */
  async getTaskDependencies(task: TaskInfo): Promise<{
    blockedBy: TaskDependency[];
    blocking: TaskDependency[];
  }> {
    const allTasks = await this.getAllTasks();
    
    // Parse blockedBy UIDs from task
    const blockedBy: TaskDependency[] = [];
    if (task.blockedBy) {
      for (const uid of task.blockedBy) {
        const blockerTask = allTasks.find(t => t.id === uid);
        if (blockerTask) {
          blockedBy.push({
            uid: blockerTask.id,
            reltype: "FINISHTOSTART", // default
          });
        }
      }
    }

    // Find tasks that this task blocks (blocking)
    const blocking: TaskDependency[] = [];
    for (const t of allTasks) {
      if (t.blockedBy && t.blockedBy.includes(task.id)) {
        blocking.push({
          uid: t.id,
          reltype: "FINISHTOSTART",
        });
      }
    }

    return { blockedBy, blocking };
  }

  /**
   * Check if adding a blocker would create a circular dependency
   */
  private checkCircularDependency(taskId: string, newBlockerId: string): boolean {
    // If taskId equals newBlockerId, it's a self-reference
    if (taskId === newBlockerId) return true;
    
    // Check if newBlockerId already depends on taskId (directly or transitively)
    const visited = new Set<string>();
    const queue = [newBlockerId];
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      
      if (current === taskId) return true;
      
      // Get dependencies of current
      const currentTask = this.findTaskByIdSync(current);
      if (currentTask?.blockedBy) {
        queue.push(...currentTask.blockedBy);
      }
    }
    
    return false;
  }

  /**
   * Synchronous helper to find a task by ID (uses cache)
   */
  private findTaskByIdSync(taskId: string): TaskInfo | null {
    const cached = this.cache.get("all");
    if (cached) {
      return cached.tasks.find(t => t.id === taskId) || null;
    }
    return null;
  }

  /**
   * Add a blockedBy relationship with bidirectional sync
   */
  async addBlockedBy(taskId: string, blockerId: string): Promise<boolean> {
    // Check for circular dependency
    if (this.checkCircularDependency(taskId, blockerId)) {
      console.warn(`[TaskService] Circular dependency detected: ${taskId} -> ${blockerId}`);
      return false;
    }

    const task = await this.getTaskByUid(taskId);
    const blocker = await this.getTaskByUid(blockerId);
    
    if (!task || !blocker) {
      console.error(`[TaskService] Task not found: ${taskId} or ${blockerId}`);
      return false;
    }

    // Add blocker to task.blockedBy
    const currentBlockedBy = task.blockedBy || [];
    if (!currentBlockedBy.includes(blockerId)) {
      const newBlockedBy = [...currentBlockedBy, blockerId];
      await this.updateTask(taskId, { blockedBy: newBlockedBy } as any);
    }

    // Automatically add task to blocker's blocking (bidirectional sync)
    const currentBlocking = blocker.blocking || [];
    if (!currentBlocking.includes(taskId)) {
      const newBlocking = [...currentBlocking, taskId];
      await this.updateTask(blockerId, { blocking: newBlocking } as any);
    }

    return true;
  }

  /**
   * Remove a blockedBy relationship with bidirectional sync
   */
  async removeBlockedBy(taskId: string, blockerId: string): Promise<void> {
    const task = await this.getTaskByUid(taskId);
    const blocker = await this.getTaskByUid(blockerId);

    if (!task || !blocker) return;

    // Remove blocker from task.blockedBy
    const currentBlockedBy = task.blockedBy || [];
    if (currentBlockedBy.includes(blockerId)) {
      const newBlockedBy = currentBlockedBy.filter(id => id !== blockerId);
      await this.updateTask(taskId, { blockedBy: newBlockedBy } as any);
    }

    // Automatically remove task from blocker's blocking
    const currentBlocking = blocker.blocking || [];
    if (currentBlocking.includes(taskId)) {
      const newBlocking = currentBlocking.filter(id => id !== taskId);
      await this.updateTask(blockerId, { blocking: newBlocking } as any);
    }
  }

  // ── Subtasks Management ────────────────────────────────────────

  /**
   * Get all subtasks for a task
   */
  async getSubtasks(taskId: string): Promise<TaskInfo[]> {
    const task = await this.getTaskByUid(taskId);
    if (!task || !task.subtasks || task.subtasks.length === 0) {
      return [];
    }

    const allTasks = await this.getAllTasks();
    const subtasks: TaskInfo[] = [];

    for (const subtaskId of task.subtasks) {
      const subtask = allTasks.find(t => t.id === subtaskId);
      if (subtask) {
        subtasks.push(subtask);
      }
    }

    return subtasks;
  }

  /**
   * Get task with all its subtasks populated
   */
  async getTaskWithSubtasks(taskId: string): Promise<TaskInfo & { subtasks: TaskInfo[] }> {
    const task = await this.getTaskByUid(taskId);
    const subtasks = await this.getSubtasks(taskId);
    
    return {
      ...task!,
      subtasks: subtasks as any,
    };
  }

  /**
   * Add a subtask to a task
   */
  async addSubtask(taskId: string, subtaskId: string): Promise<void> {
    const task = await this.getTaskByUid(taskId);
    if (!task) return;

    // Prevent self-reference
    if (taskId === subtaskId) {
      console.warn("[TaskService] Cannot add task as its own subtask");
      return;
    }

    const currentSubtasks = task.subtasks || [];
    if (!currentSubtasks.includes(subtaskId)) {
      const newSubtasks = [...currentSubtasks, subtaskId];
      await this.updateTask(taskId, { subtasks: newSubtasks } as any);
    }
  }

  /**
   * Remove a subtask from a task
   */
  async removeSubtask(taskId: string, subtaskId: string): Promise<void> {
    const task = await this.getTaskByUid(taskId);
    if (!task) return;

    const currentSubtasks = task.subtasks || [];
    if (currentSubtasks.includes(subtaskId)) {
      const newSubtasks = currentSubtasks.filter(id => id !== subtaskId);
      await this.updateTask(taskId, { subtasks: newSubtasks } as any);
    }
  }

  // ── Enhanced Delete with Dependency Cleanup ────────────────────

  async deleteTaskEnhanced(taskId: string): Promise<void> {
    const task = await this.getTaskByUid(taskId);
    if (!task) return;

    // Clean up blockedBy references
    if (task.blockedBy) {
      for (const blockerId of task.blockedBy) {
        await this.removeBlockedBy(taskId, blockerId);
      }
    }

    // Clean up blocking references (tasks that this task blocks)
    if (task.blocking) {
      for (const blockedId of task.blocking) {
        await this.removeBlockedBy(blockedId, taskId);
      }
    }

    // Clean up subtask references
    if (task.subtasks) {
      for (const subtaskId of task.subtasks) {
        await this.removeSubtask(taskId, subtaskId);
      }
    }

    // Also need to clean up any tasks that have this task as a subtask
    const allTasks = await this.getAllTasks();
    for (const t of allTasks) {
      if (t.subtasks && t.subtasks.includes(taskId)) {
        await this.removeSubtask(t.id, taskId);
      }
    }

    // Finally delete the task
    await this.deleteTask(taskId);
  }
}
