import {
  EditorView,
  ViewPlugin,
  Decoration,
  DecorationSet,
  WidgetType,
} from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";
import { TFile } from "obsidian";
import { TaskLinkDetectionService, WikilinkMatch } from "../services/TaskLinkDetectionService";
import NaviCalendarPlugin from "../main";
import { TaskLinkWidget, readTaskInfoFromFile } from "./TaskLinkWidget";

// ── Effects & Fields ───────────────────────────────────────────

const refreshEffect = StateEffect.define<void>();

// Module-level flag: set when refreshEffect is dispatched, cleared after rebuild.
// This avoids the flicker caused by immediately clearing decorations.
let pendingRefresh = false;

export function markPendingRefresh() { pendingRefresh = true; }
export function clearPendingRefresh() { pendingRefresh = false; }

const taskLinkField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(refreshEffect)) {
        // Signal a pending refresh — decorations are NOT cleared here.
        // viewPlugin.update() will rebuild synchronously on the next transaction,
        // avoiding the 150ms debounce delay and eliminating flicker.
        markPendingRefresh();
        return decorations;
      }
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

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
        // Check if a refresh is pending — if so, rebuild immediately (no debounce)
        if (pendingRefresh) {
          clearPendingRefresh();
          this.decorations = this.buildDecorations();
          return;
        }
        // Debounce updates to avoid excessive rebuilds during typing
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
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
          // Check if this wikilink is inside the task folder
          if (!this.isTaskLink(wikilink)) {
            continue;
          }

          // Try to read task info from the file
          const taskInfo = readTaskInfoFromFile(wikilink.linkPath, plugin);

          // Create widget - taskInfo is null if file doesn't exist or isn't a task
          decorations.push({
            from: wikilink.start,
            to: wikilink.end,
            value: Decoration.replace({
              widget: new TaskLinkWidget(taskInfo, plugin, wikilink),
              inclusive: true,
            }),
          });
        }

        return Decoration.set(decorations, true);
      }

      /**
       * Check if a wikilink points to a task file (inside the task folder).
       */
      private isTaskLink(wikilink: WikilinkMatch): boolean {
        const taskFolder = plugin.settings.taskFolder || "tasks/";
        const normalizedLinkPath = wikilink.linkPath.endsWith("/")
          ? wikilink.linkPath.slice(0, -1)
          : wikilink.linkPath;
        const normalizedTaskFolder = taskFolder.endsWith("/")
          ? taskFolder.slice(0, -1)
          : taskFolder;

        return normalizedLinkPath.startsWith(normalizedTaskFolder);
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );

  return [taskLinkField, viewPlugin];
}
