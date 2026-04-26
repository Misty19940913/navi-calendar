import { App, Modal, TextComponent, Setting } from "obsidian";
import NaviCalendarPlugin from "../main";
import { TaskInfo, TaskPriority } from "../types";

interface TaskModalOptions {
  prePopulatedValues?: {
    title?: string;
    scheduled?: string;
    due?: string;
    startTime?: string;
    endTime?: string;
  };
  onTaskCreated?: (taskInfo: TaskInfo) => void;
}

export class TaskCreationModal extends Modal {
  private plugin: NaviCalendarPlugin;
  private options: TaskModalOptions;

  private titleInput!: TextComponent;
  private scheduledDateInput!: TextComponent;
  private dueDateInput!: TextComponent;
  private startTimeInput!: TextComponent;
  private endTimeInput!: TextComponent;
  private saveButtonSetting!: Setting;

  constructor(plugin: NaviCalendarPlugin, options: TaskModalOptions = {}) {
    super(plugin.app);
    this.plugin = plugin;
    this.options = options;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "➕ New Task" });

    // Title
    new Setting(contentEl)
      .setName("Title")
      .addText((text) => {
        this.titleInput = text;
        text.inputEl.style.width = "100%";
        text.inputEl.placeholder = "Task title...";
        text.inputEl.autofocus = true;
        if (this.options.prePopulatedValues?.title) {
          text.setValue(this.options.prePopulatedValues.title);
        }
        text.onChange(() => this.updateSaveButton());
      });

    // Scheduled date
    new Setting(contentEl)
      .setName("Scheduled Date")
      .addText((text) => {
        this.scheduledDateInput = text;
        text.inputEl.placeholder = "YYYY-MM-DD";
        text.inputEl.style.width = "100%";
        if (this.options.prePopulatedValues?.scheduled) {
          text.setValue(this.options.prePopulatedValues.scheduled);
        }
      });

    // Due date
    new Setting(contentEl)
      .setName("Due Date")
      .addText((text) => {
        this.dueDateInput = text;
        text.inputEl.placeholder = "YYYY-MM-DD";
        text.inputEl.style.width = "100%";
        if (this.options.prePopulatedValues?.due) {
          text.setValue(this.options.prePopulatedValues.due);
        }
      });

    // Start time
    new Setting(contentEl)
      .setName("Start Time")
      .addText((text) => {
        this.startTimeInput = text;
        text.inputEl.placeholder = "HH:MM";
        text.inputEl.style.width = "100%";
        if (this.options.prePopulatedValues?.startTime) {
          text.setValue(this.options.prePopulatedValues.startTime);
        }
      });

    // End time
    new Setting(contentEl)
      .setName("End Time")
      .addText((text) => {
        this.endTimeInput = text;
        text.inputEl.placeholder = "HH:MM";
        text.inputEl.style.width = "100%";
        if (this.options.prePopulatedValues?.endTime) {
          text.setValue(this.options.prePopulatedValues.endTime);
        }
      });

    // Save button
    this.saveButtonSetting = new Setting(contentEl)
      .addButton((btn) => {
        btn.setButtonText("Create Task");
        btn.setCta();
        btn.onClick(() => this.handleCreate());
      });

    // Enter to submit
    this.titleInput.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.handleCreate();
    });

    // Initial button state
    this.updateSaveButton();
  }

  private updateSaveButton() {
    const title = this.titleInput?.getValue().trim() || "";
    const btn = this.saveButtonSetting?.descEl?.querySelector("button");
    if (btn) {
      btn.toggleAttribute("disabled", !title);
    }
  }

  private async handleCreate() {
    const title = this.titleInput.getValue().trim();
    if (!title) return;

    const scheduled = this.scheduledDateInput.getValue().trim() || undefined;
    const due = this.dueDateInput.getValue().trim() || undefined;
    const startTime = this.startTimeInput?.getValue().trim() || undefined;
    const endTime = this.endTimeInput?.getValue().trim() || undefined;

    const taskInfo = await this.plugin.taskService.createTask({
      title,
      scheduled,
      due,
      startTime,
      endTime,
    });

    if (taskInfo) {
      this.options.onTaskCreated?.(taskInfo);
      this.close();
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
