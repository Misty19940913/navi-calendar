import { App, DropdownComponent, ButtonComponent } from "obsidian";

export type DatePickerType = "due" | "scheduled" | "start" | "end";

export interface DateContextMenuOptions {
  initialDate?: string;
  onSelect: (date: string) => void;
  onClear?: () => void;
}

/**
 * Simple date context menu for selecting dates.
 * In a full implementation, this would open a calendar popup.
 */
export class DateContextMenu {
  private container: HTMLElement;
  private options: DateContextMenuOptions;

  constructor(container: HTMLElement, options: DateContextMenuOptions) {
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
      padding: 12px;
      min-width: 200px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 1000;
    `;

    // Title
    this.container.createEl("div", {
      text: "Select Date",
      attr: { style: "font-weight: 600; margin-bottom: 8px;" }
    });

    // Date input
    const inputWrapper = this.container.createDiv();
    inputWrapper.style.cssText = "margin-bottom: 12px;";

    const input = inputWrapper.createEl("input", {
      attr: {
        type: "date",
        value: this.options.initialDate || "",
        placeholder: "YYYY-MM-DD"
      }
    });
    input.style.cssText = `
      width: 100%;
      padding: 8px;
      border: 1px solid var(--background-modifier-border);
      border-radius: 4px;
      background: var(--background-primary);
      color: var(--text-primary);
    `;

    // Quick options
    const quickRow = this.container.createDiv();
    quickRow.style.cssText = `
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    `;

    const quickDates = [
      { label: "Today", days: 0 },
      { label: "Tomorrow", days: 1 },
      { label: "+3 days", days: 3 },
      { label: "+1 week", days: 7 },
      { label: "+1 month", days: 30 },
    ];

    for (const q of quickDates) {
      const btn = quickRow.createEl("button", { text: q.label });
      btn.style.cssText = `
        padding: 4px 8px;
        font-size: 12px;
        border: 1px solid var(--background-modifier-border);
        border-radius: 4px;
        background: var(--background-secondary);
        cursor: pointer;
      `;
      btn.onclick = () => {
        const date = new Date();
        date.setDate(date.getDate() + q.days);
        (input as HTMLInputElement).value = date.toISOString().split("T")[0];
      };
    }

    // Action buttons
    const btnRow = this.container.createDiv();
    btnRow.style.cssText = "display: flex; gap: 8px; justify-content: flex-end;";

    const cancelBtn = btnRow.createEl("button", { text: "Cancel" });
    cancelBtn.style.cssText = `
      padding: 6px 12px;
      border-radius: 4px;
      border: 1px solid var(--background-modifier-border);
      background: var(--background-secondary);
      cursor: pointer;
    `;
    cancelBtn.onclick = () => this.remove();

    const clearBtn = btnRow.createEl("button", { text: "Clear" });
    clearBtn.style.cssText = `
      padding: 6px 12px;
      border-radius: 4px;
      border: 1px solid var(--background-modifier-border);
      background: var(--background-secondary);
      cursor: pointer;
    `;
    clearBtn.onclick = () => {
      this.options.onClear?.();
      this.remove();
    };

    const okBtn = btnRow.createEl("button", { text: "OK" });
    okBtn.style.cssText = `
      padding: 6px 12px;
      border-radius: 4px;
      border: none;
      background: var(--interactive-accent);
      color: var(--text-on-accent);
      cursor: pointer;
    `;
    okBtn.onclick = () => {
      const value = (input as HTMLInputElement).value;
      if (value) {
        this.options.onSelect(value);
      }
      this.remove();
    };
  }

  private remove() {
    this.container.remove();
  }

  static showAt(
    targetEl: HTMLElement,
    options: DateContextMenuOptions
  ): DateContextMenu {
    const container = document.createElement("div");
    container.className = "date-context-menu";
    
    // Position near target element
    const rect = targetEl.getBoundingClientRect();
    container.style.left = `${rect.left}px`;
    container.style.top = `${rect.bottom + 4}px`;

    document.body.appendChild(container);
    return new DateContextMenu(container, options);
  }
}