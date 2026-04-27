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
      }

      update() {
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
          this.decorations = this.buildDecorations();
        }, 200);
      }

      destroy() {
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }
      }

      private buildDecorations(): DecorationSet {
        const view = this.view;
        const docText = view.state.doc.toString();
        
        const builder = new RangeSetBuilder<Decoration>();
        
        CHECKBOX_LINE_REGEX.lastIndex = 0;
        let match: RegExpExecArray | null;
        
        while ((match = CHECKBOX_LINE_REGEX.exec(docText)) !== null) {
          const [fullMatch, checkboxPart, title] = match;
          const start = match.index;
          
          // Get the line info for this match
          const lineInfo = view.state.doc.lineAt(start);
          
          // Check if this wikilink already exists (i.e., the task was already converted)
          const taskTitle = title.trim();
          const taskPath = `${plugin.settings.taskFolder || "tasks/"}${taskTitle}.md`;
          const existingFile = plugin.app.vault.getAbstractFileByPath(taskPath);
          
          // Only show + button if task file doesn't exist yet
          if (!existingFile) {
            // Create a widget at the end of this line
            const widget = new CreateTaskInlineWidget(
              plugin,
              taskTitle,
              lineInfo.to,
              view
            );
            
            const deco = Decoration.line({ widget });
            builder.add(lineInfo.to, lineInfo.to, deco);
          }
        }
        
        return builder.finish();
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
 * Clicking it creates the task file and replaces the checkbox with a wikilink.
 */
class CreateTaskInlineWidget extends WidgetType {
  constructor(
    private plugin: NaviCalendarPlugin,
    private taskTitle: string,
    private lineEnd: number,
    private view: EditorView
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
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await this.createTask();
    });

    wrapper.appendChild(btn);
    return wrapper;
  }

  private async createTask(): Promise<void> {
    try {
      const taskService = this.plugin.taskService;
      
      // Create the task file
      const task = await taskService.createTaskAsFile({ title: this.taskTitle });
      
      if (!task) {
        console.error("[NaviCalendar] createTaskAsFile returned null");
        return;
      }
      
      // Get the editor and current file
      const editor = this.view;
      const currentFile = this.plugin.app.workspace.getActiveFile();
      if (!currentFile) return;

      // Get the current line text
      const lineInfo = editor.state.doc.lineAt(this.lineEnd);
      
      // Generate the wikilink using Obsidian's method (respects user's link format)
      const taskFile = this.plugin.app.vault.getAbstractFileByPath(task.path);
      if (!taskFile || !(taskFile instanceof TFile)) return;
      
      const wikilink = this.plugin.app.fileManager.generateMarkdownLink(
        taskFile,
        currentFile.path,
        "",
        this.taskTitle
      );
      
      // Replace the entire line with the wikilink
      const lineStart = lineInfo.from;
      
      editor.dispatch({
        changes: { from: lineStart, to: lineInfo.to, insert: wikilink },
      });
      
      // The wikilink will now be picked up by TaskLinkOverlay and rendered as a card
    } catch (err) {
      console.error("[NaviCalendar] Failed to create task from checkbox:", err);
    }
  }

  eq(other: WidgetType): boolean {
    if (!(other instanceof CreateTaskInlineWidget)) return false;
    return (
      other.lineEnd === this.lineEnd &&
      other.taskTitle === this.taskTitle
    );
  }

  get estimatedHeight(): number { return -1; }
  get block(): boolean { return false; }
}