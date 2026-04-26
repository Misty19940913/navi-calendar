import { Modal, TextComponent, DropdownComponent, Setting, ButtonComponent } from "obsidian";
import NaviCalendarPlugin from "../main";
import { TaskInfo, TaskPriority } from "../types";

export class TaskEditModal extends Modal {
  plugin: NaviCalendarPlugin;
  task: TaskInfo;
  onUpdate: () => void;

  private titleInput!: TextComponent;
  private dueInput!: TextComponent;
  private scheduledInput!: TextComponent;
  private priorityDropdown!: DropdownComponent;
  private startTimeInput!: TextComponent;
  private endTimeInput!: TextComponent;

  constructor(plugin: NaviCalendarPlugin, task: TaskInfo, onUpdate: () => void) {
    super(plugin.app);
    this.plugin = plugin;
    this.task = task;
    this.onUpdate = onUpdate;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "✏️ Edit Task" });

    // Title
    new Setting(contentEl).setName("Title").addText((text) => {
      this.titleInput = text;
      text.inputEl.value = this.task.title;
    });

    // Due date
    new Setting(contentEl).setName("Due date (📅)").addText((text) => {
      this.dueInput = text;
      text.inputEl.placeholder = "YYYY-MM-DD";
      if (this.task.due) text.setValue(this.task.due);
    });

    // Scheduled date
    new Setting(contentEl).setName("Scheduled (⏰)").addText((text) => {
      this.scheduledInput = text;
      text.inputEl.placeholder = "YYYY-MM-DD";
      if (this.task.scheduled) text.setValue(this.task.scheduled);
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
        .setValue(this.task.priority || "none");
    });

    // Time range
    new Setting(contentEl).setName("Start time").addText((text) => {
      this.startTimeInput = text;
      text.inputEl.placeholder = "HH:MM";
      if (this.task.startTime) text.setValue(this.task.startTime);
    });

    new Setting(contentEl).setName("End time").addText((text) => {
      this.endTimeInput = text;
      text.inputEl.placeholder = "HH:MM";
      if (this.task.endTime) text.setValue(this.task.endTime);
    });

    // Action buttons
    new Setting(contentEl).addButton((btn) =>
      btn.setButtonText("💾 Save Changes").setCta().onClick(() => this.save())
    );

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

    // File info
    contentEl.createEl("p", {
      text: `📁 ${this.task.path}:${this.task.line}`,
      attr: { style: "color: var(--text-muted); font-size: 0.85em;" },
    });
  }

  private async save() {
    const due = this.dueInput?.getValue().trim() || undefined;
    const scheduled = this.scheduledInput?.getValue().trim() || undefined;
    const priority = this.priorityDropdown.getValue() as TaskPriority;
    const startTime = this.startTimeInput?.getValue().trim() || undefined;
    const endTime = this.endTimeInput?.getValue().trim() || undefined;

    await this.plugin.taskService.updateTask(this.task.id, {
      due,
      scheduled,
      priority,
      startTime,
      endTime,
    } as any);

    this.onUpdate();
    this.close();
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

  onClose() {}
}
