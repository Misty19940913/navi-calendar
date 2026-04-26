import {
  MarkdownPostProcessor,
  MarkdownPostProcessorContext,
  Plugin,
  TFile,
  setIcon,
  Notice,
} from "obsidian";
import { TaskKanbanView } from "./TaskKanbanView";
import { TaskService } from "../services/TaskService";

/**
 * TaskKanbanPostProcessor
 *
 * Registers a ` ```task-kanban ``` ` code block that renders a kanban board
 * showing tasks whose file `path` matches the current note's path.
 *
 * Architecture:
 * - Uses registerMarkdownPostProcessor (not registerPostProcessor) so we get
 *   context.sourcePath = the file containing the code block.
 * - Uses Vanilla JS TaskKanbanView (no React dependency needed).
 * - Reading mode only (Live Preview CodeMirror integration is Phase 2).
 */
export class TaskKanbanPostProcessor {
  private plugin: Plugin;
  private instances: Map<string, TaskKanbanView> = new Map();
  // blockId → { lineStart, lineEnd } in source file
  private blockPositions: Map<string, { lineStart: number; lineEnd: number }> = new Map();

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.plugin.registerMarkdownPostProcessor(this.processor.bind(this));
  }

  private processor = (el: HTMLElement, ctx: MarkdownPostProcessorContext): void => {
    const codeEl = el.querySelector("code");
    if (!codeEl) return;

    const lang = codeEl.className.replace("language-", "").trim();
    if (lang !== "task-kanban") return;

    const sourcePath = ctx.sourcePath;
    const sectionInfo = ctx.getSectionInfo(el);
    const blockId = `${sourcePath}:${sectionInfo?.lineStart ?? 0}`;

    // Clean up previous instance (Reading mode re-runs on scroll)
    this.cleanup(blockId);

    // ── Build DOM structure ──────────────────────────────────────
    const wrapper = el.createDiv("task-kanban-wrapper");
    wrapper.setAttribute("data-block-id", blockId);
    wrapper.setAttribute("data-source-path", sourcePath);

    // Drag handle — top-left grip icon
    const handle = wrapper.createDiv("task-kanban-handle");
    handle.setAttribute("title", "Drag to reorder this panel");
    setIcon(handle, "grip-horizontal");
    this.setupDragHandle(handle, wrapper, sourcePath, blockId);

    // Title bar
    const header = wrapper.createDiv("task-kanban-header");
    header.setText("📋 任務看板");

    // Board container
    wrapper.createDiv("task-kanban-board-container");

    // Store position for drag-reorder
    if (sectionInfo) {
      this.blockPositions.set(blockId, {
        lineStart: sectionInfo.lineStart,
        lineEnd: sectionInfo.lineEnd,
      });
    }

    // Instantiate view
    const boardContainer = wrapper.querySelector(".task-kanban-board-container") as HTMLElement;
    const view = new TaskKanbanView(boardContainer, sourcePath, this.plugin);
    this.instances.set(blockId, view);
  };

  private setupDragHandle(
    handle: HTMLElement,
    wrapper: HTMLElement,
    sourcePath: string,
    blockId: string
  ) {
    let isDragging = false;
    let startY = 0;
    let hasMoved = false;

    handle.addEventListener("mousedown", (e: MouseEvent) => {
      isDragging = true;
      startY = e.clientY;
      hasMoved = false;
      handle.addClass("is-dragging");
      document.body.addClass("task-kanban-dragging");
    });

    document.addEventListener("mousemove", (e: MouseEvent) => {
      if (!isDragging) return;
      if (Math.abs(e.clientY - startY) > 5) hasMoved = true;
    });

    document.addEventListener("mouseup", async (e: MouseEvent) => {
      if (!isDragging) return;
      isDragging = false;
      handle.removeClass("is-dragging");
      document.body.removeClass("task-kanban-dragging");

      // If significant drag, try to move the code block
      if (hasMoved) {
        const moved = await this.moveCodeBlock(sourcePath, blockId, e.clientY);
        if (moved) {
          new Notice("✅ 看板位置已移動");
        }
      }
    });
  }

  /**
   * Move the ` ```task-kanban``` ` code block to a new position in the source file.
   * Finds the nearest code block above/below clientY and swaps positions.
   */
  private async moveCodeBlock(
    sourcePath: string,
    blockId: string,
    clientY: number
  ): Promise<boolean> {
    const file = this.plugin.app.vault.getAbstractFileByPath(sourcePath);
    if (!file || !(file instanceof TFile)) return false;

    const pos = this.blockPositions.get(blockId);
    if (!pos) return false;

    // Get all code blocks in the file with their positions
    const content = await this.plugin.app.vault.read(file);
    const lines = content.split("\n");
    const blocks: Array<{ lineStart: number; lineEnd: number; text: string }> = [];

    let inBlock = false;
    let blockStart = 0;
    let blockContent: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("```")) {
        if (!inBlock) {
          inBlock = true;
          blockStart = i;
          blockContent = [line];
        } else {
          inBlock = false;
          blockContent.push(line);
          blocks.push({ lineStart: blockStart + 1, lineEnd: i + 1, text: blockContent.join("\n") });
        }
      } else if (inBlock) {
        blockContent.push(line);
      }
    }

    if (blocks.length < 2) return false; // Nothing to swap with

    // Find target position based on mouse Y
    // We need to map clientY to a line number
    // Use the editor's line height estimation
    const sourceLeaf = this.plugin.app.workspace.getMostRecentLeaf();
    if (!sourceLeaf) return false;

    // Get all leaves with the source file
    const leaves = this.plugin.app.workspace.getLeavesOfType("markdown");
    const editor = leaves.find((l) => {
      const view = l.view;
      return (view as any).file?.path === sourcePath;
    });

    if (!editor) return false;

    // Try to get line from Y position using the view
    const view = editor.view as any;
    if (!view.editor) return false;

    // Use CodeMirror to get line from Y
    const lineHeight = view.editor.defaultTextHeight ? view.editor.defaultTextHeight() : 24;
    const scrollTop = view.editor.scrollDOM?.scrollTop ?? 0;
    const relY = clientY - (view.editor.scrollDOM?.getBoundingClientRect()?.top ?? 0) + scrollTop;
    const targetLine = Math.max(1, Math.round(relY / lineHeight));

    // Find the nearest task-kanban block
    let nearestBlockIdx = -1;
    let minDist = Infinity;

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const key = `${sourcePath}:${b.lineStart}`;
      if (key === blockId) continue;
      const dist = Math.abs((b.lineStart + b.lineEnd) / 2 - targetLine);
      if (dist < minDist) {
        minDist = dist;
        nearestBlockIdx = i;
      }
    }

    if (nearestBlockIdx === -1) return false;

    const targetBlock = blocks[nearestBlockIdx];
    const targetKey = `${sourcePath}:${targetBlock.lineStart}`;
    if (targetKey === blockId) return false;

    // Swap the two blocks in the file
    const ourBlock = blocks.find((b) => `${sourcePath}:${b.lineStart}` === blockId);
    if (!ourBlock) return false;

    const newLines = [...lines];

    // Replace our block with target block text
    newLines.splice(
      ourBlock.lineStart - 1,
      ourBlock.lineEnd - ourBlock.lineStart,
      targetBlock.text
    );

    // Replace target block with our block text
    // Adjust for the shift caused by first splice
    let targetStart = targetBlock.lineStart - 1;
    if (targetBlock.lineStart > ourBlock.lineStart) {
      targetStart += ourBlock.text.split("\n").length - (ourBlock.lineEnd - ourBlock.lineStart + 1);
    }

    newLines.splice(targetStart, targetBlock.text.split("\n").length, ourBlock.text);

    const newContent = newLines.join("\n");
    await this.plugin.app.vault.modify(file, newContent);

    // Update block positions
    this.blockPositions.set(blockId, {
      lineStart: targetBlock.lineStart,
      lineEnd: targetBlock.lineStart + ourBlock.text.split("\n").length - 1,
    });
    this.blockPositions.set(targetKey, {
      lineStart: ourBlock.lineStart,
      lineEnd: ourBlock.lineStart + targetBlock.text.split("\n").length - 1,
    });

    return true;
  }

  private cleanup(blockId: string) {
    const existing = this.instances.get(blockId);
    if (existing) {
      existing.destroy();
      this.instances.delete(blockId);
    }
  }

  unload() {
    for (const [blockId, view] of this.instances) {
      view.destroy();
    }
    this.instances.clear();
    this.blockPositions.clear();
  }
}
