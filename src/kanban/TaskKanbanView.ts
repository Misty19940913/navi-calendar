import { setIcon } from "obsidian";
import { TaskInfo } from "../types";
import { TaskService } from "../services/TaskService";

/** Column definitions */
interface KanbanColumn {
  id: string;
  label: string;
  statuses: string[];
  color: string;
}

const COLUMNS: KanbanColumn[] = [
  { id: "todo", label: "To Do", statuses: [" ", ""], color: "#6b7280" },
  { id: "in-progress", label: "In Progress", statuses: [">"], color: "#3b82f6" },
  { id: "done", label: "Done", statuses: ["x", "X"], color: "#22c55e" },
  { id: "cancelled", label: "Cancelled", statuses: ["-"], color: "#ef4444" },
];

const STATUS_CHAR: Record<string, string> = {
  "todo": " ",
  "in-progress": ">",
  "done": "x",
  "cancelled": "-",
};

export class TaskKanbanView {
  private wrapper: HTMLElement;
  private sourcePath: string;
  private plugin: any; // NaviCalendarPlugin
  private boardEl: HTMLElement;
  private tasks: TaskInfo[] = [];
  private draggedCard: HTMLElement | null = null;

  constructor(wrapper: HTMLElement, sourcePath: string, plugin: any) {
    this.wrapper = wrapper;
    this.sourcePath = sourcePath;
    this.plugin = plugin;
    this.boardEl = wrapper.createDiv("task-kanban-board");
    this.render();
    this.bindDataListener();
  }

  private bindDataListener() {
    const handler = () => this.loadAndRender();
    this.plugin.app.workspace.on("navi-calendar:data-changed", handler);
  }

  private async loadAndRender() {
    const taskService: TaskService = this.plugin.taskService;
    if (!taskService) return;

    const allTasks: TaskInfo[] = await taskService.getAllTasks();
    this.tasks = allTasks.filter((t) => t.path === this.sourcePath);
    this.render();
  }

  private render() {
    this.boardEl.empty();

    for (const col of COLUMNS) {
      const colTasks = this.tasks.filter((t) => col.statuses.includes(t.status));
      const colEl = this.buildColumn(col, colTasks);
      this.boardEl.appendChild(colEl);
    }
  }

  private buildColumn(col: KanbanColumn, tasks: TaskInfo[]): HTMLElement {
    const colEl = createDiv("task-kanban-column");
    colEl.style.borderTopColor = col.color;

    // Header
    const header = colEl.createDiv("task-kanban-col-header");
    const label = header.createDiv("task-kanban-col-label");
    label.setText(col.label);
    const count = header.createDiv("task-kanban-col-count");
    count.setText(String(tasks.length));

    // Cards container
    const cards = colEl.createDiv("task-kanban-cards");

    // Drop zone
    colEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      colEl.addClass("drag-over");
    });
    colEl.addEventListener("dragleave", () => {
      colEl.removeClass("drag-over");
    });
    colEl.addEventListener("drop", async (e) => {
      e.preventDefault();
      colEl.removeClass("drag-over");
      if (!this.draggedCard) return;
      const taskId = this.draggedCard.getAttribute("data-task-id");
      if (taskId) await this.moveTask(taskId, col.id);
    });

    // Task cards
    for (const task of tasks) {
      cards.appendChild(this.buildCard(task, col.id));
    }

    return colEl;
  }

  private buildCard(task: TaskInfo, _colId: string): HTMLElement {
    const card = createDiv("task-kanban-card");
    card.setAttribute("draggable", "true");
    card.setAttribute("data-task-id", task.id);

    // Priority border
    const priorityColors: Record<string, string> = {
      urgent: "#805ad5",
      high: "#e53e3e",
      medium: "#dd6b20",
      low: "#38a169",
      none: "#6b7280",
    };
    const pColor = priorityColors[task.priority] ?? "#6b7280";
    card.style.borderLeftColor = pColor;

    // Title
    const title = card.createDiv("task-kanban-card-title");
    title.setText(task.title);

    // Due label
    const dueLabel = task.due ? `📅 ${task.due}` : task.scheduled ? `⏰ ${task.scheduled}` : null;
    if (dueLabel) {
      const due = card.createDiv("task-kanban-card-due");
      due.setText(dueLabel);
    }

    // Drag events
    card.addEventListener("dragstart", (e) => {
      this.draggedCard = card;
      (e as DragEvent).dataTransfer!.effectAllowed = "move";
      card.addClass("is-dragging");
    });
    card.addEventListener("dragend", () => {
      this.draggedCard = null;
      card.removeClass("is-dragging");
    });

    return card;
  }

  private async moveTask(taskId: string, newColId: string) {
    const taskService: TaskService = this.plugin.taskService;
    if (!taskService) return;

    const char = STATUS_CHAR[newColId] ?? " ";
    try {
      // Clear blockedBy when moving to a new column (completion/unblocking)
      await taskService.updateTask(taskId, { status: char, blockedBy: [] } as any);
      await this.loadAndRender();
    } catch (err) {
      console.error("[TaskKanban] moveTask error:", err);
    }
  }

  destroy() {
    // Nothing to clean up for Vanilla JS
  }
}
