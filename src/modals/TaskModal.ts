import { Modal, TextComponent, Setting, DropdownComponent, Notice } from "obsidian";
import NaviCalendarPlugin from "../main";
import { TaskInfo, TaskPriority } from "../types";

/**
 * Abstract base class for TaskModal - provides common UI structure
 * for both TaskCreationModal and TaskEditModal.
 */
export abstract class TaskModal extends Modal {
  protected plugin: NaviCalendarPlugin;
  
  // Core UI elements
  protected titleInput!: TextComponent;
  protected dueDateInput!: TextComponent;
  protected scheduledDateInput!: TextComponent;
  protected priorityDropdown!: DropdownComponent;
  protected startTimeInput!: TextComponent;
  protected endTimeInput!: TextComponent;
  
  // State
  protected isExpanded: boolean = false;
  protected saveButtonSetting!: Setting;

  constructor(plugin: NaviCalendarPlugin) {
    super(plugin.app);
    this.plugin = plugin;
  }

  // ── Abstract Methods ──────────────────────────────────────────

  /** Get modal title text */
  protected abstract getTitle(): string;

  /** Get current task path for display */
  protected abstract getCurrentTaskPath(): string | null;

  /** Handle save action */
  protected abstract onSave(): Promise<void>;

  /** Handle modal close */
  protected abstract onCloseAction(): void;

  // ── Common UI Rendering ────────────────────────────────────────

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    // Header with title and expand toggle
    this.renderHeader(contentEl);

    // Action bar (6 icon buttons)
    this.renderActionBar(contentEl);

    // Title input
    this.renderTitleInput(contentEl);

    // Details section
    this.renderDetailsSection(contentEl);

    // File info footer
    this.renderFooter(contentEl);

    // Subtasks section
    this.renderSubtasksSection(contentEl);

    // Dependencies section
    this.renderDependenciesSection(contentEl);

    // Projects section
    this.renderProjectsSection(contentEl);

    // Keyboard handler
    this.titleInput.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.handleSave();
      if (e.key === "Escape") this.close();
    });
  }

  private renderHeader(container: HTMLElement) {
    const header = container.createDiv("task-modal-header");
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid var(--background-modifier-border);
    `;

    // Modal title
    header.createEl("h2", { text: this.getTitle() });

    // Expand toggle button
    const expandBtn = header.createEl("button", {
      attr: {
        class: "task-modal-expand-btn",
        title: "Toggle split layout"
      }
    });
    expandBtn.style.cssText = `
      background: none;
      border: none;
      cursor: pointer;
      font-size: 18px;
      padding: 4px 8px;
      border-radius: 4px;
    `;
    expandBtn.textContent = this.isExpanded ? "⬚" : "⬗";
    expandBtn.onclick = () => this.toggleExpand();
  }

  private renderActionBar(container: HTMLElement) {
    const actionBar = container.createDiv("task-modal-action-bar");
    actionBar.style.cssText = `
      display: flex;
      gap: 8px;
      padding: 12px 20px;
      border-bottom: 1px solid var(--background-modifier-border);
      flex-wrap: wrap;
    `;

    // Due Date button (📅)
    this.createActionButton(actionBar, "📅", "Set due date", () => {
      this.showDatePicker("due");
    });

    // Scheduled Date button (⏰)
    this.createActionButton(actionBar, "⏰", "Set scheduled date", () => {
      this.showDatePicker("scheduled");
    });

    // Status button (⭕/❌/▶️/—) — dynamic emoji
    this.createStatusActionButton(actionBar);

    // Priority button (🔺/🔻/—)
    this.createActionButton(actionBar, "🔺", "Set priority", () => {
      this.showPriorityMenu();
    });

    // Blocked By
    this.createActionButton(actionBar, "🔒", "Set blocked by", () => {
      this.showBlockedByMenu();
    });

    // Blocking
    this.createActionButton(actionBar, "🔓", "Set blocking", () => {
      this.showBlockingMenu();
    });

    // Subtasks
    this.createActionButton(actionBar, "📋", "Set subtasks", () => {
      this.showSubtasksMenu();
    });

    // Projects
    this.createActionButton(actionBar, "📁", "Set projects", () => {
      this.showProjectsMenu();
    });

  }

  private showBlockedByMenu() {
    const taskId = prompt("Enter task ID that blocks this task (path:line):");
    if (taskId) {
      this.onAddDependency?.("blockedBy", taskId);
    }
  }

  private showBlockingMenu() {
    const taskId = prompt("Enter task ID that this task blocks (path:line):");
    if (taskId) {
      this.onAddDependency?.("blocking", taskId);
    }
  }

  private showSubtasksMenu() {
    const taskId = prompt("Enter task ID to add as subtask (path:line):");
    if (taskId) {
      this.onAddSubtask?.(taskId);
    }
  }

  private showProjectsMenu() {
    const projectName = prompt("Enter project name:");
    if (projectName) {
      this.onAddProject?.(projectName);
    }
  }

  private createActionButton(
    container: HTMLElement,
    emoji: string,
    tooltip: string,
    onClick: () => void
  ): HTMLElement {
    const btn = container.createEl("button", {
      attr: { class: "task-modal-action-btn", title: tooltip }
    });
    btn.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      background: var(--background-secondary);
      border: 1px solid var(--background-modifier-border);
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      transition: background 0.15s;
    `;
    btn.textContent = emoji;
    btn.onclick = onClick;
    btn.onmouseenter = () => {
      btn.style.background = "var(--background-modifier-hover)";
    };
    btn.onmouseleave = () => {
      btn.style.background = "var(--background-secondary)";
    };
    return btn;
  }

  private createStatusActionButton(container: HTMLElement): HTMLElement {
    const statusEmoji: Record<string, string> = {
      " ": "⭕",
      x: "❌",
      X: "❌",
      "-": "—",
      ">": "▶️",
    };
    const current = this.getCurrentStatus?.() || " ";
    const emoji = statusEmoji[current] || "⭕";

    const btn = container.createEl("button", {
      attr: { class: "task-modal-action-btn", title: "Set status" }
    });
    btn.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      background: var(--background-secondary);
      border: 1px solid var(--background-modifier-border);
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      transition: background 0.15s;
    `;
    btn.textContent = emoji;
    btn.onclick = () => this.showStatusMenu();
    btn.onmouseenter = () => {
      btn.style.background = "var(--background-modifier-hover)";
    };
    btn.onmouseleave = () => {
      btn.style.background = "var(--background-secondary)";
    };
    return btn;
  }

  private renderTitleInput(container: HTMLElement) {
    new Setting(container)
      .setName("Title")
      .addText((text) => {
        this.titleInput = text;
        text.inputEl.style.width = "100%";
        text.inputEl.placeholder = "Task title...";
        text.inputEl.autofocus = true;
        text.onChange(() => this.updateSaveButton());
      });
  }

  protected renderDetailsSection(container: HTMLElement) {
    // Due date
    new Setting(container)
      .setName("Due Date (📅)")
      .addText((text) => {
        this.dueDateInput = text;
        text.inputEl.placeholder = "YYYY-MM-DD";
        text.inputEl.style.width = "100%";
      });

    // Scheduled date
    new Setting(container)
      .setName("Scheduled (⏰)")
      .addText((text) => {
        this.scheduledDateInput = text;
        text.inputEl.placeholder = "YYYY-MM-DD";
        text.inputEl.style.width = "100%";
      });

    // Priority
    new Setting(container)
      .setName("Priority")
      .addDropdown((dropdown) => {
        this.priorityDropdown = dropdown;
        dropdown.addOptions({
          none: "— None",
          low: "🔻 Low",
          medium: "🟡 Medium",
          high: "🔴 High",
          urgent: "🟣 Urgent",
        });
        dropdown.setValue("none");
      });

    // Start time
    new Setting(container)
      .setName("Start time")
      .addText((text) => {
        this.startTimeInput = text;
        text.inputEl.placeholder = "HH:MM";
        text.inputEl.style.width = "100%";
      });

    // End time
    new Setting(container)
      .setName("End time")
      .addText((text) => {
        this.endTimeInput = text;
        text.inputEl.placeholder = "HH:MM";
        text.inputEl.style.width = "100%";
      });
  }

  private renderFooter(container: HTMLElement) {
    const path = this.getCurrentTaskPath();
    if (path) {
      container.createEl("p", {
        text: `📁 ${path}`,
        attr: { style: "color: var(--text-muted); font-size: 0.85em; padding: 8px 20px;" }
      });
    }
  }

  // ── Action Menu Placeholders ───────────────────────────────────

  protected showDatePicker(type: "due" | "scheduled") {
    const input = type === "due" ? this.dueDateInput : this.scheduledDateInput;
    const currentValue = input?.getValue() || "";
    
    // Simple prompt for date - in a full implementation this would open a date picker modal
    const dateStr = prompt(`Enter ${type} date (YYYY-MM-DD):`, currentValue);
    if (dateStr && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      input?.setValue(dateStr);
    }
  }

  protected showStatusMenu() {
    const statusOptions = [" ", "x", "X", "-", ">"];
    const labels: Record<string, string> = {
      " ": "⭕ Todo",
      x: "❌ Done",
      X: "❌ Done",
      "-": "— Cancelled",
      ">": "▶️ In Progress",
    };
    
    const current = this.getCurrentStatus?.() || " ";
    const selected = prompt(
      `Select status:\n${statusOptions.map(s => `  ${s === current ? '*' : ' '} ${labels[s] || s}`).join('\n')}`,
      current
    );
    
    if (selected && statusOptions.includes(selected)) {
      this.setStatus?.(selected);
    }
  }

  protected showPriorityMenu() {
    const priorities = ["none", "low", "medium", "high", "urgent"];
    const labels: Record<string, string> = {
      none: "— None",
      low: "🔻 Low",
      medium: "🟡 Medium",
      high: "🔴 High",
      urgent: "🟣 Urgent",
    };
    
    const current = this.priorityDropdown?.getValue() || "none";
    const selected = prompt(
      `Select priority:\n${priorities.map(p => `  ${p === current ? '*' : ' '} ${labels[p]}`).join('\n')}`,
      current
    );
    
    if (selected && priorities.includes(selected)) {
      this.priorityDropdown?.setValue(selected);
    }
  }

  protected showRecurrenceMenu() {
    const options = ["daily", "weekly", "monthly", "yearly", "none"];
    const selected = prompt(
      `Select recurrence:\n${options.map(o => `  ${o}`).join('\n')}`,
      "none"
    );
    
    if (selected && options.includes(selected)) {
      this.setRecurrence?.(selected === "none" ? undefined : selected);
    }
  }

  protected showRemindersMenu() {
    const reminderStr = prompt("Enter reminder (e.g., 1 day before, 09:00):", "");
    if (reminderStr !== null) {
      this.setReminders?.(reminderStr);
    }
  }

  // ── Expand Toggle ──────────────────────────────────────────────

  protected toggleExpand() {
    this.isExpanded = !this.isExpanded;
    const content = this.contentEl.querySelector(".task-modal-split-layout");
    if (content) {
      content.classList.toggle("expanded", this.isExpanded);
    }
    
    // Update button icon
    const btn = this.contentEl.querySelector(".task-modal-expand-btn");
    if (btn) {
      btn.textContent = this.isExpanded ? "⬗" : "⬚";
    }
  }

  // ── Save Handling ──────────────────────────────────────────────

  protected async handleSave() {
    try {
      await this.onSave();
    } catch (err) {
      console.error("[TaskModal] Save error:", err);
      new Notice(`Failed to save: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private updateSaveButton() {
    const title = this.titleInput?.getValue().trim() || "";
    const btn = this.saveButtonSetting?.descEl?.querySelector("button");
    if (btn) {
      btn.toggleAttribute("disabled", !title);
    }
  }

  // ── Overridable Hooks ──────────────────────────────────────────

  protected getCurrentStatus?(): string;
  protected setStatus?(status: string): void;
  protected setRecurrence?(rule: string | undefined): void;
  protected setReminders?(reminders: string): void;

  // ── Subtasks Section ──────────────────────────────────────────

  protected renderSubtasksSection(container: HTMLElement) {
    const section = container.createDiv("task-modal-subtasks");
    section.style.cssText = `
      padding: 12px 20px;
      border-top: 1px solid var(--background-modifier-border);
    `;

    const header = section.createDiv("subtasks-header");
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    `;

    header.createEl("span", {
      text: "📋 Subtasks",
      attr: { style: "font-weight: 600; font-size: 14px;" }
    });

    const addBtn = header.createEl("button", { text: "➕ Add" });
    addBtn.style.cssText = `
      background: none;
      border: 1px solid var(--background-modifier-border);
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 12px;
      cursor: pointer;
    `;
    addBtn.onclick = () => this.showAddSubtaskDialog();

    // Subtasks list container
    const list = section.createDiv("subtasks-list");
    list.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
    `;

    // Load and display existing subtasks
    this.loadSubtasks(list);
  }

  private async loadSubtasks(container: HTMLElement) {
    const subtasks = (this as any).task?.subtasks as string[] | undefined;
    if (!subtasks?.length) {
      container.createSpan({ text: "No subtasks", attr: { style: "color: var(--text-muted); font-size: 13px;" } });
      return;
    }
    for (const sub of subtasks) {
      const pill = container.createDiv("subtask-pill");
      pill.style.cssText = "display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); border-radius: 12px; font-size: 12px;";
      pill.textContent = sub;
      const removeBtn = pill.createEl("button", { text: "❌" });
      removeBtn.style.cssText = "background: none; border: none; cursor: pointer; padding: 0 2px; font-size: 10px;";
      removeBtn.onclick = () => {
        const current = ((this as any).task.subtasks as string[]).filter((s: string) => s !== sub);
        ((this as any).task as any).subtasks = current;
        pill.remove();
      };
    }
  }

  private showAddSubtaskDialog() {
    // Placeholder - would open a task selector
    const taskTitle = prompt("Enter task ID to add as subtask (path:line):");
    if (taskTitle) {
      this.onAddSubtask?.(taskTitle);
    }
  }

  protected onAddSubtask?: (subtaskId: string) => void;

  // ── Dependencies Section ──────────────────────────────────────

  protected renderDependenciesSection(container: HTMLElement) {
    const section = container.createDiv("task-modal-dependencies");
    section.style.cssText = `
      padding: 12px 20px;
      border-top: 1px solid var(--background-modifier-border);
    `;

    // Blocked By
    const blockedByHeader = section.createDiv("deps-blockedby-header");
    blockedByHeader.style.cssText = "margin-bottom: 8px;";
    blockedByHeader.createEl("span", {
      text: "🔒 Blocked By",
      attr: { style: "font-weight: 600; font-size: 14px;" }
    });

    const blockedByList = section.createDiv("blockedby-list");
    blockedByList.style.cssText = "display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px;";

    const addBlockerBtn = section.createEl("button", { text: "➕ Add Blocker" });
    addBlockerBtn.style.cssText = `
      background: none;
      border: 1px solid var(--background-modifier-border);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 12px;
      cursor: pointer;
      margin-bottom: 12px;
    `;
    addBlockerBtn.onclick = () => this.showAddDependencyDialog("blockedBy");

    // Blocking
    const blockingHeader = section.createDiv("deps-blocking-header");
    blockingHeader.style.cssText = "margin-bottom: 8px;";
    blockingHeader.createEl("span", {
      text: "🔓 Blocking",
      attr: { style: "font-weight: 600; font-size: 14px;" }
    });

    const blockingList = section.createDiv("blocking-list");
    blockingList.style.cssText = "display: flex; flex-direction: column; gap: 4px;";

    const addBlockedBtn = section.createEl("button", { text: "➕ Add Blocked" });
    addBlockedBtn.style.cssText = `
      background: none;
      border: 1px solid var(--background-modifier-border);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 12px;
      cursor: pointer;
    `;
    addBlockedBtn.onclick = () => this.showAddDependencyDialog("blocking");

    // Load existing dependencies
    this.loadDependencies(blockedByList, blockingList);
  }

  private async loadDependencies(blockedByContainer: HTMLElement, blockingContainer: HTMLElement) {
    const blockedBy = (this as any).task?.blockedBy as string[] | undefined;
    const blocking = (this as any).task?.blocking as string[] | undefined;

    if (!blockedBy?.length) {
      blockedByContainer.createSpan({ text: "None", attr: { style: "color: var(--text-muted); font-size: 13px;" } });
    } else {
      for (const id of blockedBy) {
        const pill = blockedByContainer.createDiv("blockedby-pill");
        pill.style.cssText = "display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); border-radius: 12px; font-size: 12px;";
        pill.textContent = id;
        const removeBtn = pill.createEl("button", { text: "❌" });
        removeBtn.style.cssText = "background: none; border: none; cursor: pointer; padding: 0 2px; font-size: 10px;";
        removeBtn.onclick = () => pill.remove();
      }
    }

    if (!blocking?.length) {
      blockingContainer.createSpan({ text: "None", attr: { style: "color: var(--text-muted); font-size: 13px;" } });
    } else {
      for (const id of blocking) {
        const pill = blockingContainer.createDiv("blocking-pill");
        pill.style.cssText = "display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); border-radius: 12px; font-size: 12px;";
        pill.textContent = id;
        const removeBtn = pill.createEl("button", { text: "❌" });
        removeBtn.style.cssText = "background: none; border: none; cursor: pointer; padding: 0 2px; font-size: 10px;";
        removeBtn.onclick = () => pill.remove();
      }
    }
  }

  private showAddDependencyDialog(type: "blockedBy" | "blocking") {
    const taskId = prompt(`Enter task ID to add as ${type === "blockedBy" ? "blocker" : "blocked task"} (path:line):`);
    if (taskId) {
      this.onAddDependency?.(type, taskId);
    }
  }

  protected onAddDependency?: (type: "blockedBy" | "blocking", taskId: string) => void;

  // ── Projects Section ──────────────────────────────────────────

  protected renderProjectsSection(container: HTMLElement) {
    const section = container.createDiv("task-modal-projects");
    section.style.cssText = `
      padding: 12px 20px;
      border-top: 1px solid var(--background-modifier-border);
    `;

    const header = section.createDiv("projects-header");
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    `;

    header.createEl("span", {
      text: "📁 Projects",
      attr: { style: "font-weight: 600; font-size: 14px;" }
    });

    const addBtn = header.createEl("button", { text: "➕ Add" });
    addBtn.style.cssText = `
      background: none;
      border: 1px solid var(--background-modifier-border);
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 12px;
      cursor: pointer;
    `;
    addBtn.onclick = () => this.showAddProjectDialog();

    // Projects list (pills/chips style)
    const list = section.createDiv("projects-list");
    list.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    `;

    // Load existing projects
    this.loadProjects(list);
  }

  private async loadProjects(container: HTMLElement) {
    const projects = (this as any).task?.projects as string[] | undefined;
    if (!projects?.length) {
      container.createSpan({ text: "No projects", attr: { style: "color: var(--text-muted); font-size: 13px;" } });
      return;
    }
    for (const proj of projects) {
      const pill = container.createDiv("project-pill");
      pill.style.cssText = "display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); border-radius: 12px; font-size: 12px;";
      pill.textContent = `📁 ${proj}`;
      const removeBtn = pill.createEl("button", { text: "❌" });
      removeBtn.style.cssText = "background: none; border: none; cursor: pointer; padding: 0 2px; font-size: 10px;";
      removeBtn.onclick = () => pill.remove();
    }
  }

  private showAddProjectDialog() {
    const projectName = prompt("Enter project name (or [[ProjectName]] format):");
    if (projectName) {
      this.onAddProject?.(projectName);
    }
  }

  protected onAddProject?: (projectName: string) => void;

  onClose() {
    this.contentEl.empty();
    this.onCloseAction();
  }
}