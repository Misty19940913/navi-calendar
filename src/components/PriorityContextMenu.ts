/**
 * Priority context menu for selecting task priority.
 * Priority options: None (—), Low (🔻), Medium (🟡), High (🔴), Urgent (🟣)
 */

import { TaskPriority } from "../types";

export interface PriorityContextMenuOptions {
  initialPriority?: TaskPriority;
  onSelect: (priority: TaskPriority) => void;
}

export const PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string; emoji: string }> = [
  { value: "none", label: "None", emoji: "—" },
  { value: "low", label: "Low", emoji: "🔻" },
  { value: "medium", label: "Medium", emoji: "🟡" },
  { value: "high", label: "High", emoji: "🔴" },
  { value: "urgent", label: "Urgent", emoji: "🟣" },
];

export class PriorityContextMenu {
  private container: HTMLElement;
  private options: PriorityContextMenuOptions;

  constructor(container: HTMLElement, options: PriorityContextMenuOptions) {
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
      min-width: 140px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 1000;
    `;

    // Title
    this.container.createEl("div", {
      text: "Set Priority",
      attr: { style: "font-weight: 600; padding: 4px 8px; margin-bottom: 4px;" }
    });

    // Priority options
    for (const opt of PRIORITY_OPTIONS) {
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

      if (opt.value === this.options.initialPriority) {
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
        if (opt.value !== this.options.initialPriority) {
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

  static showAt(targetEl: HTMLElement, options: PriorityContextMenuOptions): PriorityContextMenu {
    const container = document.createElement("div");
    container.className = "priority-context-menu";

    const rect = targetEl.getBoundingClientRect();
    container.style.left = `${rect.left}px`;
    container.style.top = `${rect.bottom + 4}px`;

    document.body.appendChild(container);
    return new PriorityContextMenu(container, options);
  }
}