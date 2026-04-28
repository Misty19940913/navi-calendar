import {
  EditorView,
  ViewPlugin,
  Decoration,
  DecorationSet,
  WidgetType,
} from "@codemirror/view";
import { StateField, RangeSetBuilder } from "@codemirror/state";
import { TFile } from "obsidian";
import NaviCalendarPlugin from "../main";

// Regex to match checkbox task lines
const CHECKBOX_LINE_REGEX = /^(\s*(?:[-*+]|\d+\.)\s*\[\s*[ xX]?\s*\])\s+(.+)$/gm;

const instantConvertField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decos, tr) {
    decos = decos.map(tr.changes);
    return decos;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function createTaskInstantConvertOverlay(plugin: NaviCalendarPlugin) {
  const viewPlugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      debounceTimer: ReturnType<typeof setTimeout> | null = null;

      constructor(readonly view: EditorView) {
        this.decorations = this.buildDecorations();
        // Listen for create-task events from widgets
        this.view.scrollDOM.addEventListener("navi-calendar:create-task", this.handleCreateTask as EventListener);
      }

      handleCreateTask = async (e: Event) => {
        const ce = e as CustomEvent<{ taskTitle: string; lineEnd: number }>;
        const { taskTitle, lineEnd } = ce.detail;
        await this.createTask(taskTitle, lineEnd);
      };

      update() {
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
          this.decorations = this.buildDecorations();
        }, plugin.settings.editorDebounce ?? 150);
      }

      destroy() {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.view.scrollDOM.removeEventListener("navi-calendar:create-task", this.handleCreateTask as EventListener);
      }

      buildDecorations() {
        const builder = new RangeSetBuilder<Decoration>();
        const docText = this.view.state.doc.toString();
        let match: RegExpExecArray | null;

        CHECKBOX_LINE_REGEX.lastIndex = 0;
        while ((match = CHECKBOX_LINE_REGEX.exec(docText)) !== null) {
          const [fullMatch, checkboxPart, title] = match;
          const start = match.index;
          const lineInfo = this.view.state.doc.lineAt(start);

          // Only show + button if task file doesn't exist yet
          let existingFile = null;
          try {
            const taskPath = `${plugin.settings.taskFolder || "tasks/"}${title.trim()}.md`;
            existingFile = plugin.app.vault.getAbstractFileByPath(taskPath);
          } catch (e) {
            console.error("[NaviCalendar] Error checking for existing task file:", e);
          }

          if (!existingFile) {
            const taskTitle = title.trim();
            const widget = new CreateTaskInlineWidget(
              plugin,
              taskTitle,
              lineInfo.to,
            );

            const deco = Decoration.widget({ widget, side: 1 });
            builder.add(lineInfo.to, lineInfo.to, deco);
          }
        }

        return builder.finish();
      }

      private async createTask(taskTitle: string, lineEnd: number): Promise<void> {
        try {
          const taskService = plugin.taskService;

          // Create the task file
          const task = await taskService.createTaskAsFile({ title: taskTitle });

          if (!task) {
            console.error("[NaviCalendar] createTaskAsFile returned null");
            return;
          }

          // Get the editor and current file
          const currentFile = plugin.app.workspace.getActiveFile();
          if (!currentFile) return;

          // Get the current line text
          const lineInfo = this.view.state.doc.lineAt(lineEnd);

          // Generate the wikilink using Obsidian's method (respects user's link format)
          const taskFile = plugin.app.vault.getAbstractFileByPath(task.path);
          if (!taskFile || !(taskFile instanceof TFile)) return;

          const wikilink = plugin.app.fileManager.generateMarkdownLink(
            taskFile,
            currentFile.path,
            "",
            taskTitle
          );

          // Replace the entire line with the wikilink
          const lineStart = lineInfo.from;

          this.view.dispatch({
            changes: { from: lineStart, to: lineInfo.to, insert: wikilink },
          });

          // The wikilink will now be picked up by TaskLinkOverlay and rendered as a card
        } catch (err) {
          console.error("[NaviCalendar] Failed to create task from checkbox:", err);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );

  return [instantConvertField, viewPlugin];
}

/**
 * Widget that shows a "+" create button at the end of a checkbox line.
 * Clicking it fires a custom event — ViewPlugin catches it and handles dispatch.
 * Widget must NOT hold EditorView reference to avoid memory leaks.
 */
class CreateTaskInlineWidget extends WidgetType {
  constructor(
    private plugin: NaviCalendarPlugin,
    private taskTitle: string,
    private lineEnd: number,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("span");
    wrapper.className = "navi-calendar-instant-convert";
    wrapper.style.cssText = `
      display: inline-flex;
      align-items: center;
      margin-left: 4px;
      vertical-align: middle;
    `;

    const btn = document.createElement("span");
    btn.textContent = "+";
    btn.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--text-accent, #5b9cf6);
      color: white;
      font-weight: bold;
      font-size: 12px;
      cursor: pointer;
      opacity: 0.7;
      transition: opacity 0.15s;
    `;
    btn.title = `Create task: ${this.taskTitle}`;

    btn.addEventListener("mouseenter", () => {
      btn.style.opacity = "1";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.opacity = "0.7";
    });
    // Fire a custom event — ViewPlugin catches it and handles dispatch in the EditorView context
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      wrapper.dispatchEvent(
        new CustomEvent("navi-calendar:create-task", {
          bubbles: true,
          detail: { taskTitle: this.taskTitle, lineEnd: this.lineEnd },
        })
      );
    });

    wrapper.appendChild(btn);
    return wrapper;
  }

  eq(other: WidgetType): boolean {
    if (!(other instanceof CreateTaskInlineWidget)) return false;
    return other.lineEnd === this.lineEnd && other.taskTitle === this.taskTitle;
  }

  // Widget must not hold EditorView reference — dispatch is handled by ViewPlugin
  get estimatedHeight(): number { return -1; }
  get block(): boolean { return false; }
}
