import { WidgetType } from "@codemirror/view";
import { TFile } from "obsidian";
import { TaskInfo } from "../types";
import NaviCalendarPlugin from "../main";
import { WikilinkMatch } from "../services/TaskLinkDetectionService";
import { slugify } from "../utils/linkUtils";

export class TaskLinkWidget extends WidgetType {
  private taskInfo: TaskInfo | null; // null = task doesn't exist yet
  private plugin: NaviCalendarPlugin;
  private wikilinkMatch: WikilinkMatch;
  private displayTitle: string;

  constructor(taskInfo: TaskInfo | null, plugin: NaviCalendarPlugin, wikilinkMatch: WikilinkMatch) {
    super();
    this.taskInfo = taskInfo;
    this.plugin = plugin;
    this.wikilinkMatch = wikilinkMatch;
    this.displayTitle = wikilinkMatch.title;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("span");
    wrapper.className = "navi-calendar-tasklink-widget";
    wrapper.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 6px;
      background: var(--background-secondary);
      border-radius: 4px;
      vertical-align: middle;
      cursor: pointer;
      font-size: 0.9em;
    `;

    if (this.taskInfo) {
      // EXISTING TASK: render task card
      // Status dot
      const statusDot = document.createElement("span");
      statusDot.className = "navi-calendar-task-status-dot";
      const isChecked = this.taskInfo.status === "completed" || this.taskInfo.status === "x";
      statusDot.style.cssText = `
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: ${isChecked ? "var(--checkbox-icon-color-checked, #6pa548)" : "transparent"};
        border: 2px solid ${isChecked ? "var(--checkbox-icon-color-checked, #6pa548)" : "var(--text-muted, #999)"};
        display: inline-block;
      `;
      wrapper.appendChild(statusDot);

      // Title
      const title = document.createElement("span");
      title.textContent = this.displayTitle;
      title.style.cssText = `
        color: var(--text-normal);
        ${isChecked ? "text-decoration: line-through; opacity: 0.6;" : ""}
      `;
      wrapper.appendChild(title);

      // Priority badge (if set)
      if (this.taskInfo.priority && this.taskInfo.priority !== "none") {
        const priorityBadge = document.createElement("span");
        priorityBadge.textContent = this.getPriorityEmoji(this.taskInfo.priority);
        priorityBadge.style.cssText = "font-size: 0.8em; margin-left: 2px;";
        wrapper.appendChild(priorityBadge);
      }

      // Due date (if set)
      if (this.taskInfo.due) {
        const due = document.createElement("span");
        due.textContent = this.formatDueDate(this.taskInfo.due);
        due.style.cssText = "color: var(--text-muted); font-size: 0.8em; margin-left: 4px;";
        wrapper.appendChild(due);
      }

      // Click to toggle status
      wrapper.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this.toggleStatus();
      });

      // Double-click to open file
      wrapper.addEventListener("dblclick", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this.openTaskFile();
      });
    } else {
      // TASK DOESN'T EXIST: render + create button
      const icon = document.createElement("span");
      icon.textContent = "+";
      icon.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: var(--text-accent, #5b9cf6);
        color: white;
        font-weight: bold;
        font-size: 10px;
      `;
      wrapper.appendChild(icon);

      const label = document.createElement("span");
      label.textContent = `Create "${this.displayTitle}"`;
      label.style.cssText = "color: var(--text-accent, #5b9cf6); font-size: 0.85em;";
      wrapper.appendChild(label);

      wrapper.title = `Create task: ${this.displayTitle}`;

      wrapper.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this.createAndOpenTask();
      });
    }

    return wrapper;
  }

  private async toggleStatus(): Promise<void> {
    if (!this.taskInfo) return;

    const file = this.plugin.app.vault.getAbstractFileByPath(this.taskInfo.path);
    if (!(file instanceof TFile)) return;

    const currentStatus = this.taskInfo.status;
    const newStatus = (currentStatus === "completed" || currentStatus === "x") ? " " : "x";

    try {
      const content = await this.plugin.app.vault.read(file);
      const updatedContent = this.updateFrontmatterStatus(content, newStatus);
      await this.plugin.app.vault.modify(file, updatedContent);

      // Update the local task info
      this.taskInfo.status = newStatus;

      // Trigger data changed to refresh views
      this.plugin.triggerDataChanged();
    } catch (err) {
      console.error("[NaviCalendar] Failed to toggle status:", err);
    }
  }

  private updateFrontmatterStatus(content: string, newStatus: string): string {
    // Simple frontmatter status update
    // Handles both "status: " and "status: x" formats
    const statusRegex = /^(---\n[\s\S]*?status:\s*)(".*?"|\S*)(\s*)$/m;
    if (statusRegex.test(content)) {
      return content.replace(statusRegex, `$1${newStatus}$3`);
    }
    // If no status in frontmatter, add it after the opening ---
    return content.replace(/^(---\n)/m, `$1status: ${newStatus}\n`);
  }

  private async openTaskFile(): Promise<void> {
    if (!this.taskInfo) return;
    const file = this.plugin.app.vault.getAbstractFileByPath(this.taskInfo.path);
    if (file instanceof TFile) {
      await this.plugin.app.workspace.getLeaf(false).openFile(file);
    }
  }

  private async createAndOpenTask(): Promise<void> {
    try {
      const task = await this.plugin.taskService.createTaskAsFile({ title: this.displayTitle });
      if (task) {
        const file = this.plugin.app.vault.getAbstractFileByPath(task.path);
        if (file instanceof TFile) {
          await this.plugin.app.workspace.getLeaf(false).openFile(file);
        }
      }
    } catch (err) {
      console.error("[NaviCalendar] Failed to create task:", err);
    }
  }

  private getPriorityEmoji(priority: string): string {
    const map: Record<string, string> = {
      "urgent": "🔴",
      "high": "🟠",
      "medium": "🟡",
      "low": "🟢",
      "none": ""
    };
    return map[priority] || "";
  }

  private formatDueDate(due: string): string {
    try {
      const date = due.split(" ")[0]; // Remove time part if present
      return date;
    } catch {
      return due;
    }
  }

  eq(other: WidgetType): boolean {
    if (!(other instanceof TaskLinkWidget)) return false;
    // Compare position AND task status — if status changed (done↔todo), widget must be recreated
    const samePosition =
      this.wikilinkMatch.start === other.wikilinkMatch.start &&
      this.wikilinkMatch.end === other.wikilinkMatch.end;
    const sameStatus =
      (this.taskInfo?.status ?? "") === (other.taskInfo?.status ?? "");
    return samePosition && sameStatus;
  }

  // Only block mousedown (prevents CodeMirror cursor move), let click through so dblclick fires
  ignoreEvent(event: Event): boolean {
    return event.type === "mousedown";
  }

  get estimatedHeight(): number { return -1; }
  get block(): boolean { return false; }
}

/**
 * Read task metadata from a file's frontmatter.
 * Returns null if the file doesn't exist or isn't a task file.
 */
export function readTaskInfoFromFile(filePath: string, plugin: NaviCalendarPlugin): TaskInfo | null {
  const file = plugin.app.vault.getAbstractFileByPath(filePath);
  if (!(file instanceof TFile)) return null;

  const cache = plugin.app.metadataCache.getFileCache(file);
  const fm = cache?.frontmatter;
  if (!fm) return null;

  // Check if this is a task file by looking for task tag or type field
  // navi-calendar uses: tags includes "task" OR type === "task"
  const tags = fm.tags;
  const isTask = (Array.isArray(tags) && tags.includes("task")) || fm.type === "task";
  if (!isTask) return null;

  // Construct OS-spec ID from file path: tasks/買早餐.md → task/買早餐:0
  const slug = file.basename.replace(/\.md$/, "");
  const id = `task/${slugify(slug)}:0`;

  return {
    id,
    path: filePath,
    title: fm.title || file.basename.replace(/\.md$/, ""),
    status: fm.status || " ",
    priority: fm.priority || "none",
    due: fm.due,
    scheduled: fm.scheduled,
    line: 1,
  };
}
