import { Notice } from "obsidian";
import { TaskModal } from "./TaskModal";
import { TaskInfo, TaskPriority } from "../types";

interface TaskCreationOptions {
  prePopulatedValues?: {
    title?: string;
    scheduled?: string;
    due?: string;
    startTime?: string;
    endTime?: string;
  };
  onTaskCreated?: (taskInfo: TaskInfo) => void;
}

export class TaskCreationModal extends TaskModal {
  private options: TaskCreationOptions;

  constructor(plugin: NaviCalendarPlugin, options: TaskCreationOptions = {}) {
    super(plugin);
    this.options = options;
  }

  // ── Abstract Implementation ────────────────────────────────────

  protected getTitle(): string {
    return "➕ New Task";
  }

  protected getCurrentTaskPath(): string | null {
    return null; // New task, no path yet
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

    // Use createTaskAsFile for file-based task creation
    const taskInfo = await this.plugin.taskService.createTaskAsFile({
      title,
      due,
      scheduled,
      startTime,
      endTime,
    });

    if (taskInfo) {
      this.options.onTaskCreated?.(taskInfo);
      this.close();
    }
  }

  protected onCloseAction(): void {
    // Creation specific cleanup if needed
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  async onOpen() {
    await super.onOpen();

    // Apply pre-populated values
    if (this.options.prePopulatedValues) {
      if (this.options.prePopulatedValues.title) {
        this.titleInput.setValue(this.options.prePopulatedValues.title);
      }
      if (this.options.prePopulatedValues.scheduled) {
        this.scheduledDateInput?.setValue(this.options.prePopulatedValues.scheduled);
      }
      if (this.options.prePopulatedValues.due) {
        this.dueDateInput?.setValue(this.options.prePopulatedValues.due);
      }
      if (this.options.prePopulatedValues.startTime) {
        this.startTimeInput?.setValue(this.options.prePopulatedValues.startTime);
      }
      if (this.options.prePopulatedValues.endTime) {
        this.endTimeInput?.setValue(this.options.prePopulatedValues.endTime);
      }
    }

    // Add save button at the bottom
    this.renderSaveButton();
  }

  private renderSaveButton() {
    const contentEl = this.contentEl;
    
    const btnArea = contentEl.createDiv("task-modal-footer");
    btnArea.style.cssText = `
      display: flex;
      gap: 8px;
      padding: 16px 20px;
      border-top: 1px solid var(--background-modifier-border);
    `;

    const saveBtn = btnArea.createEl("button", {
      text: "Create Task",
      attr: { class: "mod-cta" }
    });
    saveBtn.style.cssText = `
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 14px;
    `;
    saveBtn.onclick = () => this.handleSave();

    const cancelBtn = btnArea.createEl("button", { text: "Cancel" });
    cancelBtn.style.cssText = `
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 14px;
    `;
    cancelBtn.onclick = () => this.close();
  }
}