/**
 * Status context menu for selecting task status.
 * Status options: ⭕ Todo, ❌ Done, ▶️ In Progress, — Cancelled
 */

export type TaskStatusOption = " " | "x" | "X" | "-" | ">";

export interface StatusContextMenuOptions {
  initialStatus?: string;
  onSelect: (status: TaskStatusOption) => void;
}

export const STATUS_OPTIONS: Array<{ value: TaskStatusOption; label: string; emoji: string }> = [
  { value: " ", label: "Todo", emoji: "⭕" },
  { value: "x", label: "Done", emoji: "❌" },
  { value: "X", label: "Done (alt)", emoji: "❌" },
  { value: ">", label: "In Progress", emoji: "▶️" },
  { value: "-", label: "Cancelled", emoji: "—" },
];

export class StatusContextMenu {
  private container: HTMLElement;
  private options: StatusContextMenuOptions;

  constructor(container: HTMLElement, options: StatusContextMenuOptions) {
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
      min-width: 160px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 1000;
    `;

    // Title
    this.container.createEl("div", {
      text: "Set Status",
      attr: { style: "font-weight: 600; padding: 4px 8px; margin-bottom: 4px;" }
    });

    // Status options
    for (const opt of STATUS_OPTIONS) {
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
      
      if (opt.value === this.options.initialStatus) {
        item.style.background = "var(--background-modifier-hover)";
      }

      const emoji = item.createEl("span", { text: opt.emoji });
      emoji.style.cssText = "font-size: 16px;";

      const label = item.createEl("span", { text: opt.label });
      label.style.cssText = "font-size: 14px;";

      item.onmouseenter = () => {
        item.style.background = "var(--background-modifier-hover)";
      };
      item.onmouseleave = () => {
        if (opt.value !== this.options.initialStatus) {
          item.style.background = "";
        }
      };
      item.onclick = () => {
        this.options.onSelect(opt.value);
        this.remove();
      };
    }
  }

  private remove() {
    this.container.remove();
  }

  static showAt(targetEl: HTMLElement, options: StatusContextMenuOptions): StatusContextMenu {
    const container = document.createElement("div");
    container.className = "status-context-menu";
    
    const rect = targetEl.getBoundingClientRect();
    container.style.left = `${rect.left}px`;
    container.style.top = `${rect.bottom + 4}px`;

    document.body.appendChild(container);
    return new StatusContextMenu(container, options);
  }
}