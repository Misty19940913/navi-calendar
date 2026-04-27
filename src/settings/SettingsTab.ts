import { PluginSettingTab, Setting, Notice, requestUrl } from "obsidian";
import NaviCalendarPlugin from "../main";
import { NaviCalendarSettings } from "../types";

interface RemoteManifest {
  version: string;
  minAppVersion?: string;
}

// Semantic version comparison: returns positive if a > b
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

export class SettingsTab extends PluginSettingTab {
  plugin: NaviCalendarPlugin;

  constructor(plugin: NaviCalendarPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── Plugin Header ────────────────────────────────────────────
    containerEl.createDiv("navi-cal-header", (el) => {
      el.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid var(--background-modifier-border);
        margin-bottom: 16px;
      `;

      // Left: plugin icon + name + version
      el.createDiv("navi-cal-header-left", (left) => {
        left.style.cssText = "display: flex; align-items: center; gap: 12px;";
        left.createEl("span", { text: "📅", attr: { style: "font-size: 28px;" } });
        left.createDiv("navi-cal-header-info", (info) => {
          info.style.cssText = "display: flex; flex-direction: column; gap: 2px;";
          info.createEl("strong", { text: "Navi Calendar" });
          info.createEl("span", {
            text: `Version ${(this.plugin as any).manifest?.version || "0.1.0"}`,
            attr: { style: "color: var(--text-muted); font-size: 0.85em;" }
          });
        });
      });

      // Right: Check updates button
      const versionBtn = el.createEl("button", {
        text: "Check for Updates",
        attr: {
          style: `
            background: var(--interactive-accent);
            color: var(--text-on-accent);
            border: none;
            border-radius: 6px;
            padding: 6px 14px;
            font-size: 13px;
            cursor: pointer;
          `
        }
      });
      let updateAvailable = false;

      versionBtn.onclick = async () => {
        // If update is already detected, perform in-place update
        if (updateAvailable) {
          versionBtn.setAttribute("disabled", "true");
          versionBtn.textContent = "Updating...";
          try {
            const remoteVersion = (this.plugin as any).manifest?.version || "0.0.0";
            const repo = "Misty19940913/navi-calendar";
            const baseUrl = `https://github.com/${repo}/releases/download/v${remoteVersion}`;

            // Download all assets in parallel
            const [manifestRes, mainRes, stylesRes] = await Promise.all([
              requestUrl({ url: `${baseUrl}/manifest.json` }),
              requestUrl({ url: `${baseUrl}/main.js` }),
              requestUrl({ url: `${baseUrl}/styles.css` }),
            ]);

            // Get plugin directory path
            const pluginDir = (this.plugin as any).manifest?.dir || ".obsidian/plugins/navi-calendar/";
            const adapter = this.plugin.app.vault.adapter;

            // Write files using writeBinary (ArrayBuffer from text)
            await adapter.writeBinary(pluginDir + "manifest.json", new TextEncoder().encode(manifestRes.text).buffer);
            await adapter.writeBinary(pluginDir + "main.js", new TextEncoder().encode(mainRes.text).buffer);
            await adapter.writeBinary(pluginDir + "styles.css", new TextEncoder().encode(stylesRes.text).buffer);

            new Notice(`✅ Plugin updated to v${remoteVersion}. Reloading...`, 4000);

            // Trigger plugin reload via Obsidian's plugin manager
            await (this.plugin.app as any).plugins.reloadPlugin((this.plugin as any).manifest?.id);
          } catch (err) {
            console.error("[NaviCalendar] Update failed:", err);
            new Notice("❌ Update failed. Check internet connection and try again.", 4000);
            versionBtn.textContent = "Update";
            versionBtn.removeAttribute("disabled");
          }
          return;
        }

        versionBtn.setAttribute("disabled", "true");
        versionBtn.textContent = "Checking...";
        try {
          const repo = "Misty19940913/navi-calendar";
          const url = `https://raw.githubusercontent.com/${repo}/main/manifest.json`;
          const response = await requestUrl({ url });
          const remote: RemoteManifest = response.json;

          const currentVersion = (this.plugin as any).manifest?.version || "0.0.0";
          const remoteVersion = remote.version || "0.0.0";
          const cmp = compareVersions(remoteVersion, currentVersion);

          if (cmp > 0) {
            updateAvailable = true;
            new Notice(`🎉 Update available: v${remoteVersion} (you have v${currentVersion})`, 5000);
            versionBtn.textContent = "Update";
            versionBtn.removeAttribute("disabled");
            // Also style the button to make update action obvious
            versionBtn.style.background = "var(--text-accent)";
          } else {
            new Notice(`✅ You're on the latest version (v${currentVersion})`, 3000);
            versionBtn.textContent = "Check for Updates";
            versionBtn.removeAttribute("disabled");
          }
        } catch (err) {
          console.error("[NaviCalendar] Update check failed:", err);
          new Notice("❌ Failed to check for updates. Check your internet connection.", 4000);
          versionBtn.textContent = "Check for Updates";
          versionBtn.removeAttribute("disabled");
        }
      };
    });

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

    // ── Task Modal Preferences ─────────────────────────────────────
    containerEl.createEl("h3", { text: "Task Modal Preferences" });

    new Setting(containerEl)
      .setName("Enable split layout")
      .setDesc("Show expanded split layout with markdown editor by default")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableModalSplitLayout ?? false)
          .onChange(async (value) => {
            this.plugin.settings.enableModalSplitLayout = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default to expanded")
      .setDesc("Open task modals in expanded state by default")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.defaultExpanded ?? false)
          .onChange(async (value) => {
            this.plugin.settings.defaultExpanded = value;
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
