import { App, Modal, TextComponent, Setting, ButtonComponent, DropdownComponent } from "obsidian";
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

    // Status button (⭕/❌/▶️/—)
    this.createActionButton(actionBar, "⭕", "Set status", () => {
      this.showStatusMenu();
    });

    // Priority button (🔺/🔻/—)
    this.createActionButton(actionBar, "🔺", "Set priority", () => {
      this.showPriorityMenu();
    });

    // Recurrence button (🔁)
    this.createActionButton(actionBar, "🔁", "Set recurrence", () => {
      this.showRecurrenceMenu();
    });

    // Reminders button (🔔)
    this.createActionButton(actionBar, "🔔", "Set reminders", () => {
      this.showRemindersMenu();
    });
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
      btn.textContent = this.isExpanded ? "⬚" : "⬗";
    }
  }

  // ── Save Handling ──────────────────────────────────────────────

  protected async handleSave() {
    try {
      await this.onSave();
    } catch (err) {
      console.error("[TaskModal] Save error:", err);
      new Notice(`Failed to save: ${err.message}`);
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

  onClose() {
    this.contentEl.empty();
    this.onCloseAction();
  }
}