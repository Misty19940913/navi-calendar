import { PluginSettingTab, Setting, Notice } from "obsidian";
import NaviCalendarPlugin from "../main";
import { NaviCalendarSettings } from "../types";

export class SettingsTab extends PluginSettingTab {
  plugin: NaviCalendarPlugin;

  constructor(plugin: NaviCalendarPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "📅 Navi Calendar — Settings" });

    // ── Required: Journal Folder ──────────────────────────────
    containerEl.createEl("h3", { text: "Required Setup" });

    new Setting(containerEl)
      .setName("Journal / Calendar folder")
      .setDesc("The folder where daily notes are stored (e.g., journal/ or daily/)")
      .addText((text) =>
        text
          .setPlaceholder("journal/")
          .setValue(this.plugin.settings.journalFolder)
          .onChange(async (value) => {
            this.plugin.settings.journalFolder = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Daily note template")
      .setDesc("Path to your daily note template file (e.g. templates/daily.md). Supports {{date}}, {{title}}, {{time_created}}")
      .addText((text) =>
        text
          .setPlaceholder("templates/daily.md")
          .setValue(this.plugin.settings.journalTemplatePath)
          .onChange(async (value) => {
            this.plugin.settings.journalTemplatePath = value.trim();
            await this.plugin.saveSettings();
          })
      );

    // ── Task Settings ─────────────────────────────────────────
    containerEl.createEl("h3", { text: "Task Settings" });

    new Setting(containerEl)
      .setName("Task folder")
      .setDesc("Folder where task .md files are stored")
      .addText((text) =>
        text
          .setPlaceholder("tasks/")
          .setValue(this.plugin.settings.taskFolder)
          .onChange(async (value) => {
            this.plugin.settings.taskFolder = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Task template")
      .setDesc("Path to task template file")
      .addText((text) =>
        text
          .setPlaceholder("templates/task.md")
          .setValue(this.plugin.settings.taskTemplatePath)
          .onChange(async (value) => {
            this.plugin.settings.taskTemplatePath = value.trim();
            await this.plugin.saveSettings();
          })
      );

    // ── View Preferences ─────────────────────────────────────
    containerEl.createEl("h3", { text: "View Preferences" });

    new Setting(containerEl)
      .setName("Default view")
      .setDesc("Which view to show when opening the calendar")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            dayGridMonth: "Month View",
            timeGridWeek: "Week View",
            timeGridDay: "Day View",
            listWeek: "List View",
          })
          .setValue(this.plugin.settings.defaultView)
          .onChange(async (value) => {
            this.plugin.settings.defaultView = value as any;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("First day of week")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({ 0: "Sunday", 1: "Monday", 6: "Saturday" })
          .setValue(String(this.plugin.settings.firstDayOfWeek))
          .onChange(async (value) => {
            this.plugin.settings.firstDayOfWeek = parseInt(value);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show weekends")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showWeekends)
          .onChange(async (value) => {
            this.plugin.settings.showWeekends = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show week numbers")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showWeekNumbers)
          .onChange(async (value) => {
            this.plugin.settings.showWeekNumbers = value;
            await this.plugin.saveSettings();
          })
      );

    // ── Task Display ─────────────────────────────────────────
    containerEl.createEl("h3", { text: "Task Display" });

    new Setting(containerEl)
      .setName("Show scheduled tasks")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showScheduled)
          .onChange(async (value) => {
            this.plugin.settings.showScheduled = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show due tasks")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showDue)
          .onChange(async (value) => {
            this.plugin.settings.showDue = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show recurring tasks")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showRecurring)
          .onChange(async (value) => {
            this.plugin.settings.showRecurring = value;
            await this.plugin.saveSettings();
          })
      );

    // ── Open Direction ────────────────────────────────────────
    containerEl.createEl("h3", { text: "Navigation" });

    new Setting(containerEl)
      .setName("Open calendar in")
      .setDesc("How to open the calendar when clicked")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            "replace": "Replace current view",
            "new-tab": "New tab",
          })
          .setValue(this.plugin.settings.openDirection)
          .onChange(async (value) => {
            this.plugin.settings.openDirection = value as any;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Mini calendar sidebar")
      .setDesc("Which sidebar to show the mini calendar")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            "left": "Left sidebar",
            "right": "Right sidebar",
          })
          .setValue(this.plugin.settings.miniCalendarSidebar)
          .onChange(async (value) => {
            this.plugin.settings.miniCalendarSidebar = value as any;
            await this.plugin.saveSettings();
          })
      );

    // ── Colors ────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Colors" });

    const colorFields: Array<{ key: keyof NaviCalendarSettings; label: string }> = [
      { key: "priorityHighColor", label: "High priority" },
      { key: "priorityMediumColor", label: "Medium priority" },
      { key: "priorityLowColor", label: "Low priority" },
      { key: "priorityUrgentColor", label: "Urgent priority" },
      { key: "overdueColor", label: "Overdue tasks" },
      { key: "blockedColor", label: "Blocked tasks" },
      { key: "timeblockColor", label: "Time blocks" },
    ];

    for (const { key, label } of colorFields) {
      const k = key as string;
      new Setting(containerEl)
        .setName(label)
        .addColorPicker((color) =>
          color
            .setValue(this.plugin.settings[k as keyof NaviCalendarSettings] as string)
            .onChange(async (value) => {
              (this.plugin.settings as unknown as Record<string, string>)[k] = value;
              await this.plugin.saveSettings();
            })
        );
    }

    // ── AI Commands ───────────────────────────────────────────
    containerEl.createEl("h3", { text: "🤖 AI Commands" });

    containerEl.createEl("p", {
      text: "You can control tasks via Hermes AI. Try:",
      attr: { style: "color: var(--text-muted); font-size: 0.9em;" },
    });

    const cmdExamples = [
      'Add task: "Buy groceries" due tomorrow',
      'Edit task "Report": set due 2026-05-01',
      'Complete task "Meeting notes"',
      'Move task "Call" to next week',
      'Delete task "Old task"',
    ];

    for (const cmd of cmdExamples) {
      containerEl.createEl("code", {
        text: cmd,
        attr: {
          style:
            "display: block; padding: 4px 8px; margin: 4px 0; background: var(--background-secondary); border-radius: 4px; font-size: 0.85em;",
        },
      });
    }
  }
}
