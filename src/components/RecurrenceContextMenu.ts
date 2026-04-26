/**
 * Recurrence context menu for setting task recurrence rules.
 * Supports: None, Daily, Weekly, Monthly, Yearly, Custom
 */

export interface RecurrenceContextMenuOptions {
  initialRecurrence?: string;
  onSelect: (recurrence: string | undefined) => void;
}

export interface RecurrenceOption {
  value: string;
  label: string;
  description: string;
}

export const RECURRENCE_OPTIONS: RecurrenceOption[] = [
  { value: "none", label: "No recurrence", description: "Task does not repeat" },
  { value: "daily", label: "Daily", description: "Repeats every day" },
  { value: "weekly", label: "Weekly", description: "Repeats every week" },
  { value: "monthly", label: "Monthly", description: "Repeats every month" },
  { value: "yearly", label: "Yearly", description: "Repeats every year" },
  { value: "custom", label: "Custom...", description: "Define custom RRule" },
];

export class RecurrenceContextMenu {
  private container: HTMLElement;
  private options: RecurrenceContextMenuOptions;

  constructor(container: HTMLElement, options: RecurrenceContextMenuOptions) {
    this.container = container;
    this.options = options;
    this.render();
  }

  private render() {
    this.container.style.cssText = `
      position: absolute;
      background: var(--background-primary);
      border: 1px solid var(--background-modifier-border);
      border-radius: 8px;
      padding: 8px;
      min-width: 200px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 1000;
    `;

    // Title
    this.container.createEl("div", {
      text: "Set Recurrence 🔁",
      attr: { style: "font-weight: 600; padding: 4px 8px; margin-bottom: 4px;" }
    });

    // Recurrence options
    for (const opt of RECURRENCE_OPTIONS) {
      const item = this.container.createDiv();
      item.style.cssText = `
        padding: 10px 12px;
        cursor: pointer;
        border-radius: 4px;
        transition: background 0.15s;
        margin-bottom: 2px;
      `;

      // Check if selected
      const isSelected = this.options.initialRecurrence === opt.value ||
        (opt.value === "none" && !this.options.initialRecurrence);

      if (isSelected) {
        item.style.background = "var(--background-modifier-hover)";
      }

      const labelRow = item.createDiv();
      labelRow.style.cssText = "display: flex; align-items: center; gap: 8px;";

      const label = labelRow.createEl("span", { text: opt.label });
      label.style.cssText = "font-size: 14px; font-weight: 500;";

      const desc = item.createEl("div", { text: opt.description });
      desc.style.cssText = "font-size: 11px; color: var(--text-muted); margin-top: 2px;";

      item.onmouseenter = () => {
        item.style.background = "var(--background-modifier-hover)";
      };
      item.onmouseleave = () => {
        if (!isSelected) {
          item.style.background = "";
        }
      };
      item.onclick = () => {
        if (opt.value === "custom") {
          this.showCustomDialog();
        } else {
          this.options.onSelect(opt.value === "none" ? undefined : opt.value);
          this.remove();
        }
      };
    }
  }

  private showCustomDialog() {
    const rrule = prompt(
      "Enter custom RRule (e.g., FREQ=WEEKLY;INTERVAL=2;BYDAY=MO):",
      this.options.initialRecurrence || ""
    );
    if (rrule !== null) {
      this.options.onSelect(rrule || undefined);
    }
    this.remove();
  }

  private remove() {
    this.container.remove();
  }

  static showAt(targetEl: HTMLElement, options: RecurrenceContextMenuOptions): RecurrenceContextMenu {
    const container = document.createElement("div");
    container.className = "recurrence-context-menu";

    const rect = targetEl.getBoundingClientRect();
    container.style.left = `${rect.left}px`;
    container.style.top = `${rect.bottom + 4}px`;

    document.body.appendChild(container);
    return new RecurrenceContextMenu(container, options);
  }
}