import { Modal, TextComponent, DropdownComponent, Setting } from "obsidian";
import NaviCalendarPlugin from "../main";
import { TaskCreationData, TaskPriority } from "../types";

export class TaskCreationModal extends Modal {
  plugin: NaviCalendarPlugin;
  onSave: () => void;
  initialData: Partial<TaskCreationData>;

  private titleInput!: TextComponent;
  private dueInput!: TextComponent;
  private scheduledInput!: TextComponent;
  private priorityDropdown!: DropdownComponent;
  private startTimeInput!: TextComponent;
  private endTimeInput!: TextComponent;

  constructor(
    plugin: NaviCalendarPlugin,
    initialData: Partial<TaskCreationData> = {},
    onSave: () => void
  ) {
    super(plugin.app);
    this.plugin = plugin;
    this.initialData = initialData;
    this.onSave = onSave;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "➕ New Task" });

    // Title
    new Setting(contentEl).setName("Title").addText((text) => {
      this.titleInput = text;
      text.inputEl.placeholder = "Task title...";
      text.inputEl.autofocus = true;
    });

    // Due date
    new Setting(contentEl).setName("Due date (📅)").addText((text) => {
      this.dueInput = text;
      text.inputEl.placeholder = "YYYY-MM-DD";
      if (this.initialData.due) text.setValue(this.initialData.due);
    });

    // Scheduled date
    new Setting(contentEl).setName("Scheduled (⏰)").addText((text) => {
      this.scheduledInput = text;
      text.inputEl.placeholder = "YYYY-MM-DD";
      if (this.initialData.scheduled) text.setValue(this.initialData.scheduled);
    });

    // Priority
    new Setting(contentEl).setName("Priority").addDropdown((dropdown) => {
      this.priorityDropdown = dropdown;
      dropdown
        .addOptions({
          none: "None",
          low: "🟢 Low",
          medium: "🟡 Medium",
          high: "🔴 High",
          urgent: "🟣 Urgent",
        })
        .setValue("none");
    });

    // Time range (for timeblocks)
    new Setting(contentEl).setName("Time range").addText((text) => {
      this.startTimeInput = text;
      text.inputEl.placeholder = "HH:MM (start)";
      if (this.initialData.startTime) text.setValue(this.initialData.startTime);
    });

    new Setting(contentEl).addText((text) => {
      this.endTimeInput = text;
      text.inputEl.placeholder = "HH:MM (end)";
      if (this.initialData.endTime) text.setValue(this.initialData.endTime);
    });

    // Save button
    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Create Task")
        .setCta()
        .onClick(() => this.save())
    );
  }

  private async save() {
    const title = this.titleInput.getValue().trim();
    if (!title) return;

    const due = this.dueInput.getValue().trim() || undefined;
    const scheduled = this.scheduledInput.getValue().trim() || undefined;
    const priority = this.priorityDropdown.getValue() as TaskPriority;
    const startTime = this.startTimeInput?.getValue().trim() || undefined;
    const endTime = this.endTimeInput?.getValue().trim() || undefined;

    await this.plugin.taskService.createTask({
      title,
      due,
      scheduled,
      priority,
      startTime,
      endTime,
    });

    this.onSave();
    this.close();
  }

  onClose() {}
}
