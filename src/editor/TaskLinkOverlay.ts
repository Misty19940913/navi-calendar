import {
  EditorView,
  ViewPlugin,
  Decoration,
  DecorationSet,
  WidgetType,
} from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";
import {
  Plugin,
  TFile,
  Notice,
} from "obsidian";
import { TaskLinkDetectionService, WikilinkMatch } from "../services/TaskLinkDetectionService";
import NaviCalendarPlugin from "../main";

// ── Effects & Fields ───────────────────────────────────────────

const refreshEffect = StateEffect.define<void>();

const taskLinkField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(refreshEffect)) {
        // Force rebuild by clearing and triggering update
        return Decoration.none;
      }
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ── Widget ────────────────────────────────────────────────────

class CreateTaskWidget extends WidgetType {
  private readonly wikilink: WikilinkMatch;
  private readonly plugin: NaviCalendarPlugin;

  constructor(wikilink: WikilinkMatch, plugin: NaviCalendarPlugin) {
    super();
    this.wikilink = wikilink;
    this.plugin = plugin;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "navi-calendar-tasklink-button";
    span.style.cssText = `
      display: inline-flex;
      align-items: center;
      margin-left: 4px;
      cursor: pointer;
      color: var(--text-accent, #5b9cf6);
      font-size: 0.9em;
      vertical-align: middle;
    `;
    span.title = `Create task: ${this.wikilink.title}`;

    const icon = document.createElement("span");
    icon.textContent = "+";
    icon.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--text-accent, #5b9cf6);
      color: var(--bg-primary, #1e1e1e);
      font-weight: bold;
      font-size: 12px;
      line-height: 1;
    `;

    span.appendChild(icon);

    span.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await this.createTask();
    });

    return span;
  }

  private async createTask(): Promise<void> {
    const { taskService } = this.plugin;
    const title = this.wikilink.title;

    try {
      const task = await taskService.createTaskAsFile({ title });
      if (task) {
        // Open the created file
        const file = this.plugin.app.vault.getAbstractFileByPath(task.path);
        if (file instanceof TFile) {
          const leaf = this.plugin.app.workspace.getLeaf(false);
          if (leaf) {
            await leaf.openFile(file);
          }
        }
        new Notice(`✅ Task created: ${title}`, 2000);
      }
    } catch (err) {
      console.error("[NaviCalendar] Failed to create task:", err);
      new Notice(`❌ Failed to create task: ${title}`, 3000);
    }
  }

  eq(other: CreateTaskWidget): boolean {
    return other.wikilink.start === this.wikilink.start &&
           other.wikilink.end === this.wikilink.end &&
           other.wikilink.title === this.wikilink.title;
  }

  toString(): string {
    return `CreateTaskWidget(${this.wikilink.title})`;
  }
}

// ── Plugin ────────────────────────────────────────────────────

export function createTaskLinkOverlay(plugin: NaviCalendarPlugin) {
  const detectionService = new TaskLinkDetectionService(
    plugin.app,
    plugin.settings.taskFolder || "tasks/"
  );

  const viewPlugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      debounceTimer: ReturnType<typeof setTimeout> | null = null;

      constructor(readonly view: EditorView) {
        this.decorations = this.buildDecorations();
      }

      update() {
        // Debounce updates to avoid excessive rebuilds during typing
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
          // Rebuild and assign to the instance field
          this.decorations = this.buildDecorations();
        }, 150);
      }

      destroy() {
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }
      }

      private buildDecorations(): DecorationSet {
        const view = this.view;
        const docText = view.state.doc.toString();
        const wikilinks = detectionService.findWikilinks(docText);

        if (wikilinks.length === 0) {
          return Decoration.none;
        }

        const decorations: Array<{ from: number; to: number; value: Decoration }> = [];

        for (const wikilink of wikilinks) {
          // Check if this is a missing task link
          if (!detectionService.isMissingTaskLink(wikilink.linkPath)) {
            continue;
          }

          // Add widget after the wikilink
          decorations.push({
            from: wikilink.end,
            to: wikilink.end,
            value: Decoration.replace({
              widget: new CreateTaskWidget(wikilink, plugin),
            }),
          });
        }

        return Decoration.set(decorations, true);
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );

  return viewPlugin;
}
