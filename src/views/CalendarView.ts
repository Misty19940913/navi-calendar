import {
  ItemView,
  WorkspaceLeaf,
  Notice,
} from "obsidian";
import { format } from "date-fns";
import { Calendar } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import multimonthPlugin from "@fullcalendar/multimonth";

import NaviCalendarPlugin from "../main";
import { CALENDAR_VIEW_TYPE, EVENT_DATA_CHANGED } from "../types";
import { TaskCreationModal } from "../modals/TaskCreationModal";
import { TaskEditModal } from "../modals/TaskEditModal";
import { TaskService } from "../services/TaskService";

export class CalendarView extends ItemView {
  private calendar: Calendar | null = null;
  private taskService: TaskService;

  // Debounce
  private _dataUpdateTimer: ReturnType<typeof setTimeout> | null = null;
  private _isFirstRender = true;

  constructor(leaf: WorkspaceLeaf, plugin: NaviCalendarPlugin) {
    super(leaf);
    console.log("[navi-calendar] CalendarView constructor called");
    this.taskService = plugin.taskService;
  }

  // ── Obsidian View required methods ─────────────────────────────

  override getViewType(): string {
    return CALENDAR_VIEW_TYPE;
  }

  override getDisplayText(): string {
    return "Navi Calendar";
  }

  override getIcon(): string {
    return "calendar";
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  override async onOpen() {
    console.log("[navi-calendar] CalendarView onOpen called");
    await this.initCalendar();
  }

  override async onClose() {
    this.destroy();
  }

  private async initCalendar() {
    // contentEl comes from ItemView base class
    this.contentEl.innerHTML = "";
    const calendarEl = this.contentEl.createDiv("navi-calendar-container");
    calendarEl.style.height = "100%";
    calendarEl.style.overflow = "auto";

    await this.buildCalendar(calendarEl);

    this.registerEvent(
      this.app.workspace.on(EVENT_DATA_CHANGED, () => {
        this.debouncedRefresh();
      })
    );
  }

  private async buildCalendar(containerEl: HTMLElement) {
    const plugin = (this.app.plugins.plugins["navi-calendar"] as NaviCalendarPlugin | undefined);
    const settings = plugin?.settings;
    const defaultView = settings?.defaultView || "dayGridMonth";

    this.calendar = new Calendar(containerEl, {
      plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, multimonthPlugin],
      initialView: defaultView,
      firstDay: settings?.firstDayOfWeek ?? 1,
      weekends: settings?.showWeekends ?? true,
      weekNumbers: settings?.showWeekNumbers ?? false,
      headerToolbar: {
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
      },
      height: "100%",
      events: async (info: any, successCallback: any, failureCallback: any) => {
        try {
          const events = await this.taskService.getCalendarEvents(
            format(info.start, "yyyy-MM-dd"),
            format(info.end, "yyyy-MM-dd")
          );
          successCallback(events);
        } catch (e) {
          failureCallback(e);
        }
      },
      // ── Event Click: Open task edit ────────────────────────
      eventClick: (info: any) => {
        const task = info.event.extendedProps?.task;
        if (!task) return;

        const naviPlugin = this.app.plugins.plugins["navi-calendar"] as NaviCalendarPlugin;
        if (naviPlugin) {
          new TaskEditModal(naviPlugin, task, () => {
            this.refresh();
          }).open();
        }
      },
      // ── Date Click: Open daily note ────────────────────────
      dateClick: (info: any) => {
        const dateStr = format(info.date, "yyyy-MM-dd");
        const naviPlugin = this.app.plugins.plugins["navi-calendar"] as NaviCalendarPlugin;
        const direction = info.jsEvent?.shiftKey
          ? "split-right"
          : (naviPlugin?.settings?.openDirection || "split-right");

        this.taskService.openDailyNote(dateStr, direction);
      },
      // ── Event Drag & Drop: Update due date ────────────────
      eventDrop: async (info: any) => {
        const task = info.event.extendedProps?.task;
        if (!task) return;

        const newDate = format(info.event.start!, "yyyy-MM-dd");
        try {
          await this.taskService.updateTask(task.id, { due: newDate });
          const naviPlugin = this.app.plugins.plugins["navi-calendar"] as NaviCalendarPlugin;
          naviPlugin?.triggerDataChanged();
        } catch (e) {
          info.revert();
          new Notice(`[navi-calendar] Failed to move task: ${e}`);
        }
      },
      // ── Event Resize: Update time ─────────────────────────
      eventResize: async (info: any) => {
        const task = info.event.extendedProps?.task;
        if (!task) return;

        const newEnd = format(info.event.end!, "HH:mm");
        const newStart = format(info.event.start!, "HH:mm");

        try {
          await this.taskService.updateTask(task.id, {
            startTime: newStart,
            endTime: newEnd,
          } as any);
          const naviPlugin = this.app.plugins.plugins["navi-calendar"] as NaviCalendarPlugin;
          naviPlugin?.triggerDataChanged();
        } catch (e) {
          info.revert();
          new Notice(`[navi-calendar] Failed to resize task: ${e}`);
        }
      },
      // ── Select (drag to create timeblock) ──────────────────
      select: (info: any) => {
        const startStr = format(info.start, "yyyy-MM-dd");
        const startTimeStr = format(info.start, "HH:mm");
        const endTimeStr = format(info.end, "HH:mm");

        const naviPlugin = this.app.plugins.plugins["navi-calendar"] as NaviCalendarPlugin;
        if (naviPlugin) {
          new TaskCreationModal(
            naviPlugin,
            {
              scheduled: startStr,
              startTime: startTimeStr,
              endTime: endTimeStr,
            },
            () => {
              this.refresh();
            }
          ).open();
        }

        this.calendar?.unselect();
      },
      // ── Task Creation ───────────────────────────────────────
      selectable: true,
      selectMirror: true,
      editable: true,
      eventDurationEditable: true,
      // ── Custom rendering ────────────────────────────────────
      eventDidMount: (info: any) => {
        const task = info.event.extendedProps?.task;
        if (!task) return;

        if (task.isBlocked) {
          info.el.classList.add("navi-cal-blocked");
          info.el.setAttribute("title", "This task is blocked by another task");
        }

        if (info.event.extendedProps?.isRecurring) {
          const titleEl = info.el.querySelector(".fc-event-title");
          if (titleEl) {
            titleEl.textContent = "🔁 " + titleEl.textContent;
          }
        }
      },
      // ── Day cell rendering ──────────────────────────────────
      dayCellDidMount: (info: any) => {
        const today = format(new Date(), "yyyy-MM-dd");
        const cellDate = format(info.date, "yyyy-MM-dd");
        if (cellDate === today) {
          info.el.classList.add("navi-cal-today");
        }
      },
      // ── List item rendering ─────────────────────────────────
      eventContent: (arg: any) => {
        const task = arg.event.extendedProps?.task;
        if (!task) return { html: arg.event.title };

        const priorityIcon = this.getPriorityIcon(task.priority);
        const timeStr = arg.timeText ? `<span class="navi-cal-time">${arg.timeText}</span>` : "";
        const icon = arg.event.extendedProps?.isTimeblock ? "⏱️" : "📋";

        return {
          html: `<div class="navi-cal-event">${icon}${priorityIcon}${arg.event.title}</div>`,
        };
      },
    });

    this.calendar.render();
  }

  private getPriorityIcon(priority: string): string {
    switch (priority) {
      case "urgent": return "🟣";
      case "high": return "🔴";
      case "medium": return "🟡";
      case "low": return "🟢";
      default: return "";
    }
  }

  // ── Navigation ───────────────────────────────────────────────

  gotoDate(date: string) {
    if (this.calendar) {
      this.calendar.gotoDate(date);
    }
  }

  // ── Refresh ─────────────────────────────────────────────────

  refresh() {
    if (this.calendar) {
      this.calendar.refetchEvents();
    }
  }

  private debouncedRefresh() {
    if (this._dataUpdateTimer) {
      clearTimeout(this._dataUpdateTimer);
    }

    if (this._isFirstRender) {
      this._isFirstRender = false;
      this.refresh();
      return;
    }

    this._dataUpdateTimer = setTimeout(() => {
      this.refresh();
    }, 5000);
  }

  // ── Cleanup ─────────────────────────────────────────────────

  override destroy() {
    if (this._dataUpdateTimer) {
      clearTimeout(this._dataUpdateTimer);
    }
    if (this.calendar) {
      this.calendar.destroy();
      this.calendar = null;
    }
    super.destroy();
  }
}
