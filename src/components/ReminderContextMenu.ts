/**
 * Reminder context menu for setting task reminders.
 * Supports relative reminders (e.g., "1 day before") and absolute times.
 */

export interface ReminderItem {
  time: string;
  label: string;
}

export interface ReminderContextMenuOptions {
  initialReminders?: string[];
  onSelect: (reminders: string[]) => void;
}

export const PRESET_REMINDERS: ReminderItem[] = [
  { time: "PT0M", label: "At time of task" },
  { time: "PT5M", label: "5 minutes before" },
  { time: "PT15M", label: "15 minutes before" },
  { time: "PT30M", label: "30 minutes before" },
  { time: "PT1H", label: "1 hour before" },
  { time: "PT2H", label: "2 hours before" },
  { time: "PT1D", label: "1 day before" },
  { time: "PT2D", label: "2 days before" },
  { time: "PT1W", label: "1 week before" },
];

export class ReminderContextMenu {
  private container: HTMLElement;
  private options: ReminderContextMenuOptions;
  private selectedReminders: Set<string>;

  constructor(container: HTMLElement, options: ReminderContextMenuOptions) {
    this.container = container;
    this.options = options;
    this.selectedReminders = new Set(options.initialReminders || []);
    this.render();
  }

  private render() {
    this.container.style.cssText = `
      position: absolute;
      background: var(--background-primary);
      border: 1px solid var(--background-modifier-border);
      border-radius: 8px;
      padding: 8px;
      min-width: 220px;
      max-height: 320px;
      overflow-y: auto;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 1000;
    `;

    // Title
    this.container.createEl("div", {
      text: "Set Reminders 🔔",
      attr: { style: "font-weight: 600; padding: 4px 8px; margin-bottom: 8px;" }
    });

    // Preset options
    for (const preset of PRESET_REMINDERS) {
      const item = this.container.createDiv();
      item.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        cursor: pointer;
        border-radius: 4px;
        transition: background 0.15s;
      `;

      const isSelected = this.selectedReminders.has(preset.time);
      if (isSelected) {
        item.style.background = "var(--background-modifier-hover)";
      }

      // Checkbox indicator
      const checkbox = item.createEl("span", { text: isSelected ? "☑️" : "☐" });
      checkbox.style.cssText = "font-size: 14px;";

      const label = item.createEl("span", { text: preset.label });
      label.style.cssText = "font-size: 13px;";

      item.onmouseenter = () => {
        item.style.background = "var(--background-modifier-hover)";
      };
      item.onmouseleave = () => {
        if (!isSelected) {
          item.style.background = "";
        }
      };
      item.onclick = () => {
        if (isSelected) {
          this.selectedReminders.delete(preset.time);
        } else {
          this.selectedReminders.add(preset.time);
        }
        this.options.onSelect(Array.from(this.selectedReminders));
        // Re-render to update checkboxes
        this.container.empty();
        this.render();
      };
    }

    // Divider
    const divider = this.container.createEl("div");
    divider.style.cssText = `
      height: 1px;
      background: var(--background-modifier-border);
      margin: 8px 0;
    `;

    // Custom reminder option
    const customItem = this.container.createDiv();
    customItem.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      cursor: pointer;
      border-radius: 4px;
    `;
    customItem.onmouseenter = () => {
      customItem.style.background = "var(--background-modifier-hover)";
    };
    customItem.onmouseleave = () => {
      customItem.style.background = "";
    };
    customItem.onclick = () => {
      this.showCustomReminderDialog();
    };

    const plusIcon = customItem.createEl("span", { text: "➕" });
    plusIcon.style.cssText = "font-size: 14px;";

    const customLabel = customItem.createEl("span", { text: "Add custom reminder..." });
    customLabel.style.cssText = "font-size: 13px;";

    // Done button
    const btnRow = this.container.createDiv();
    btnRow.style.cssText = "display: flex; justify-content: flex-end; margin-top: 8px;";

    const doneBtn = btnRow.createEl("button", { text: "Done" });
    doneBtn.style.cssText = `
      padding: 6px 16px;
      border-radius: 4px;
      border: none;
      background: var(--interactive-accent);
      color: var(--text-on-accent);
      cursor: pointer;
    `;
    doneBtn.onclick = () => {
      this.options.onSelect(Array.from(this.selectedReminders));
      this.remove();
    };
  }

  private showCustomReminderDialog() {
    const customTime = prompt(
      "Enter custom reminder (ISO 8601 duration, e.g., PT2H30M for 2.5 hours before):",
      ""
    );
    if (customTime !== null && customTime.trim()) {
      this.selectedReminders.add(customTime.trim());
      this.container.empty();
      this.render();
    }
  }

  private remove() {
    this.container.remove();
  }

  static showAt(targetEl: HTMLElement, options: ReminderContextMenuOptions): ReminderContextMenu {
    const container = document.createElement("div");
    container.className = "reminder-context-menu";

    const rect = targetEl.getBoundingClientRect();
    container.style.left = `${rect.left}px`;
    container.style.top = `${rect.bottom + 4}px`;

    document.body.appendChild(container);
    return new ReminderContextMenu(container, options);
  }
}