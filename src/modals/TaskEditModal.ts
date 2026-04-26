import { Notice, Setting } from "obsidian";
import { TaskModal } from "./TaskModal";
import { TaskInfo, TaskPriority } from "../types";
import NaviCalendarPlugin from "../main";

export class TaskEditModal extends TaskModal {
  task: TaskInfo;
  onUpdate: () => void;
  private statusValue: string;

  constructor(plugin: NaviCalendarPlugin, task: TaskInfo, onUpdate: () => void) {
    super(plugin);
    this.task = task;
    this.onUpdate = onUpdate;
    this.statusValue = task.status || " ";
  }

  // ── Abstract Implementation ────────────────────────────────────

  protected getTitle(): string {
    return "✏️ Edit Task";
  }

  protected getCurrentTaskPath(): string {
    return `${this.task.path}:${this.task.line}`;
  }

  protected async onSave(): Promise<void> {
    const title = this.titleInput.getValue().trim();
    if (!title) {
      new Notice("Please enter a task title");
      return;
    }

    const due = this.dueDateInput?.getValue().trim() || undefined;
    const scheduled = this.scheduledDateInput?.getValue().trim() || undefined;
    const priority = this.priorityDropdown?.getValue() as TaskPriority;
    const startTime = this.startTimeInput?.getValue().trim() || undefined;
    const endTime = this.endTimeInput?.getValue().trim() || undefined;

    await this.plugin.taskService.updateTask(this.task.id, {
      title, // Note: updateTask doesn't handle title, but we pass it
      due,
      scheduled,
      priority,
      startTime,
      endTime,
      completed: this.statusValue === "x" || this.statusValue === "X",
    } as any);

    this.onUpdate();
    this.close();
  }

  protected onCloseAction(): void {
    // Nothing special for edit modal
  }

  // ── Override Details Section ──────────────────────────────────

  protected renderDetailsSection(container: HTMLElement): void {
    // Due date
    new Setting(container)
      .setName("Due Date (📅)")
      .addText((text) => {
        this.dueDateInput = text;
        text.inputEl.placeholder = "YYYY-MM-DD";
        text.inputEl.style.width = "100%";
        if (this.task.due) text.setValue(this.task.due);
      });

    // Scheduled date
    new Setting(container)
      .setName("Scheduled (⏰)")
      .addText((text) => {
        this.scheduledDateInput = text;
        text.inputEl.placeholder = "YYYY-MM-DD";
        text.inputEl.style.width = "100%";
        if (this.task.scheduled) text.setValue(this.task.scheduled);
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
        dropdown.setValue(this.task.priority || "none");
      });

    // Start time
    new Setting(container)
      .setName("Start time")
      .addText((text) => {
        this.startTimeInput = text;
        text.inputEl.placeholder = "HH:MM";
        text.inputEl.style.width = "100%";
        if (this.task.startTime) text.setValue(this.task.startTime);
      });

    // End time
    new Setting(container)
      .setName("End time")
      .addText((text) => {
        this.endTimeInput = text;
        text.inputEl.placeholder = "HH:MM";
        text.inputEl.style.width = "100%";
        if (this.task.endTime) text.setValue(this.task.endTime);
      });
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  async onOpen() {
    await super.onOpen();

    // Add action buttons at bottom
    this.renderActionButtons();
  }

  private renderActionButtons() {
    const contentEl = this.contentEl;

    // Toggle completion button
    const isDone = this.task.status === "x" || this.task.status === "X";
    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText(isDone ? "↩️ Mark as Todo" : "✅ Mark as Done")
        .onClick(() => this.toggleComplete())
    );

    // Delete button
    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("🗑️ Delete Task")
        .setWarning()
        .onClick(() => this.delete())
    );
  }

  private async toggleComplete() {
    const isDone = this.task.status === "x" || this.task.status === "X";
    await this.plugin.taskService.updateTask(this.task.id, {
      completed: !isDone,
    });
    this.onUpdate();
    this.close();
  }

  private async delete() {
    if (confirm(`Delete task "${this.task.title}"?`)) {
      await this.plugin.taskService.deleteTask(this.task.id);
      this.onUpdate();
      this.close();
    }
  }

  // ── Status/Priority/Recurrence Hooks ───────────────────────────

  protected getCurrentStatus(): string {
    return this.statusValue;
  }

  protected setStatus(status: string): void {
    this.statusValue = status;
  }

  protected setRecurrence(rule: string | undefined): void {
    // Would need to implement recurrence field - placeholder for now
    console.log("[TaskEditModal] setRecurrence:", rule);
  }

  protected setReminders(reminders: string): void {
    // Would need to implement reminders field - placeholder for now
    console.log("[TaskEditModal] setReminders:", reminders);
  }
}