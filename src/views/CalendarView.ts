import {
  ItemView,
  WorkspaceLeaf,
  Notice,
  Menu,
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
  private plugin: NaviCalendarPlugin;

  // Debounce
  private _dataUpdateTimer: ReturnType<typeof setTimeout> | null = null;
  private _isFirstRender = true;

  constructor(leaf: WorkspaceLeaf, plugin: NaviCalendarPlugin) {
    super(leaf);
    console.log("[navi-calendar] CalendarView constructor called");
    this.plugin = plugin;
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
    this._isFirstRender = true;
    await this.initCalendar();
  }

  private async initCalendar() {
    // contentEl comes from ItemView base class
    this.contentEl.innerHTML = "";
    const calendarEl = this.contentEl.createDiv("navi-calendar-container");
    calendarEl.style.height = "100%";
    calendarEl.style.overflow = "auto";

    await this.buildCalendar(calendarEl);

    this.registerEvent(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.app.workspace.on(EVENT_DATA_CHANGED as any, () => {
        this.debouncedRefresh();
      })
    );
  }

  private async buildCalendar(containerEl: HTMLElement) {
    const plugin = this.plugin;
    const settings = plugin?.settings;
    const defaultView = settings?.defaultView || "dayGridMonth";

    // Inject Google Calendar-style CSS overrides
    const style = document.createElement("style");
    style.id = "navi-calendar-custom-styles";
    style.textContent = `
      /* Today: blue circle, horizontally centered, vertically at top */
      .fc-day-today > .fc-daygrid-day-frame > .fc-daygrid-day-top {
        display: flex;
        justify-content: center;
        align-items: flex-start;
      }
      .fc-day-today > .fc-daygrid-day-frame > .fc-daygrid-day-top > .fc-daygrid-day-number {
        background: #1a73e8 !important;
        color: #ffffff !important;
        border-radius: 50% !important;
        width: 28px !important;
        height: 28px !important;
        line-height: 28px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-weight: 600 !important;
      }
      .fc-day-today > .fc-daygrid-day-frame {
        position: relative;
        background: rgba(26, 115, 232, 0.08) !important;
      }
      .fc-daygrid-day-number {
        text-align: center !important;
        width: 100%;
        display: block;
      }
      .fc-daygrid-day-top {
        flex-direction: column;
        align-items: center;
      }
      .fc-daygrid-day-frame {
        min-height: unset;
      }
      .fc-daygrid-day-events {
        margin-top: 2px;
      }
      /* Week / TimeGrid day number styling */
      .fc-timegrid-day-number {
        text-align: center !important;
        width: 100%;
        display: block;
      }
      /* List view date styling */
      .fc-list-day-text {
        text-align: center !important;
      }
    `;
    containerEl.appendChild(style);

    this.calendar = new Calendar(containerEl, {
      plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, multimonthPlugin],
      initialView: defaultView,
      firstDay: settings?.firstDayOfWeek ?? 1,
      weekends: settings?.showWeekends ?? true,
      weekNumbers: settings?.showWeekNumbers ?? false,
      views: {
        dayGridMonth: { buttonText: "Month" },
        timeGridWeek: { buttonText: "Week" },
        timeGridDay: { buttonText: "Day" },
        listWeek: { buttonText: "List" },
      },
      customButtons: {
        viewSelector: {
          text: this.plugin?.settings?.defaultView === "dayGridMonth" ? "Month" :
                this.plugin?.settings?.defaultView === "timeGridWeek" ? "Week" :
                this.plugin?.settings?.defaultView === "timeGridDay" ? "Day" : "Month",
          click: () => {
            this.showViewDropdown();
          },
        },
      },
      headerToolbar: {
        left: "prev,next today",
        center: "title",
        right: "viewSelector",
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

        const naviPlugin = this.plugin;
        if (naviPlugin) {
          new TaskEditModal(naviPlugin, task, () => {
            this.refresh();
          }).open();
        }
      },
      // ── Event Drag & Drop: Update due date ────────────────
      eventDrop: async (info: any) => {
        const task = info.event.extendedProps?.task;
        if (!task) return;

        const newDate = format(info.event.start!, "yyyy-MM-dd");
        try {
          await this.taskService.updateTask(task.id, { due: newDate });
          const naviPlugin = this.plugin;
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
          const naviPlugin = this.plugin;
          naviPlugin?.triggerDataChanged();
        } catch (e) {
          info.revert();
          new Notice(`[navi-calendar] Failed to resize task: ${e}`);
        }
      },
      // ── Select (drag to create timeblock) ──────────────────
      select: (info: any) => this.handleDateSelect(info),
      // ── Task Creation ───────────────────────────────────────
      selectable: true,
      selectMirror: false,
      editable: true,
      eventDurationEditable: true,
      // ── Custom rendering ────────────────────────────────────
      eventDidMount: (info: any) => {
        const task = info.event.extendedProps?.task;
        if (!task) return;

        // ── Blocked styling ──────────────────────────────────
        if (task.isBlocked) {
          info.el.classList.add("navi-cal-blocked");
          info.el.setAttribute("title", "This task is blocked by another task");
        }

        // ── Recurring icon ────────────────────────────────────
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

  private async handleDateSelect(info: any): Promise<void> {
    const menu = new Menu();

    menu.addItem((item) => {
      item.setTitle("Create task")
        .setIcon("check-square")
        .onClick(async () => {
          const values = {
            title: "",
            scheduled: info.allDay 
              ? (info.startStr ? info.startStr.split("T")[0] : undefined)
              : (info.startStr ? info.startStr.split("T")[0] : undefined),
            due: undefined,
            startTime: info.allDay ? undefined : (info.startStr ? info.startStr.split("T")[1]?.substring(0, 5) : undefined),
            endTime: info.allDay ? undefined : (info.endStr ? info.endStr.split("T")[1]?.substring(0, 5) : undefined),
          };
          const modal = new TaskCreationModal(
            this.plugin,
            {
              prePopulatedValues: values,
              onTaskCreated: () => {
                this.refresh();
              }
            }
          );
          modal.open();
        });
    });

    menu.addItem((item) => {
      item.setTitle("Create time entry")
        .setIcon("play")
        .onClick(() => {
          new Notice("Create time entry — 尚未實作");
        });
    });

    menu.addItem((item) => {
      item.setTitle("Open daily note")
        .setIcon("calendar")
        .onClick(() => {
          const dateStr = info.allDay
            ? (info.startStr ? info.startStr.split("T")[0] : undefined)
            : (info.startStr ? info.startStr.split("T")[0] : undefined);
          if (dateStr) {
            const direction = info.jsEvent?.shiftKey
              ? "split-right"
              : (this.plugin?.settings?.openDirection || "split-right");
            this.taskService.openDailyNote(dateStr, direction);
          }
        });
    });

    menu.showAtMouseEvent(info.jsEvent as MouseEvent);
    this.calendar?.unselect();
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

  // ── View Dropdown ───────────────────────────────────────────────

  private showViewDropdown() {
    const views = [
      { id: "dayGridMonth", label: "Month" },
      { id: "timeGridWeek", label: "Week" },
      { id: "timeGridDay", label: "Day" },
      { id: "listWeek", label: "List" },
    ];

    const current = this.calendar?.view?.type || "dayGridMonth";
    this.createViewDropdownDOM(views, current);
  }

  private createViewDropdownDOM(
    views: Array<{ id: string; label: string }>,
    current: string
  ) {
    // Remove existing dropdown if any
    const existing = this.contentEl.querySelector(".navi-view-dropdown");
    if (existing) existing.remove();

    const dropdown = this.contentEl.createDiv("navi-view-dropdown");
    dropdown.style.cssText = `
      position: absolute;
      z-index: 9999;
      width: 200px;
      background: #ffffff;
      border: 1px solid #DADCE0;
      border-radius: 8px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.15);
      padding: 4px 0;
      overflow: hidden;
    `;

    views.forEach(v => {
      const isSelected = v.id === current;

      const item = dropdown.createDiv("navi-view-item");
      item.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        cursor: pointer;
        font-size: 14px;
        font-family: 'Google Sans', 'Segoe UI', sans-serif;
        color: #202124;
        transition: background 0.15s ease;
        user-select: none;
      `;

      // Checkmark for selected item
      if (isSelected) {
        const check = item.createSpan("navi-view-check");
        check.style.cssText = `margin-right: 4px;`;
        check.textContent = "✓";
        check.style.color = "#1a73e8";
        check.style.fontSize = "14px";
      }

      // Emoji icon removed per user request

      // Label
      const label = item.createSpan("navi-view-label");
      label.style.cssText = isSelected ? `font-weight: 500; color: #1a73e8;` : `font-weight: 400;`;
      label.textContent = v.label;

      // Hover effect using native DOM events
      item.onmouseenter = () => {
        if (!isSelected) item.style.background = "#F1F3F4";
      };
      item.onmouseleave = () => {
        item.style.background = "";
      };

      item.onClickEvent((e: MouseEvent) => {
        e.stopPropagation();
        this.changeView(v.id);
        dropdown.remove();
      });
    });

    // Close on outside click
    const contentElAny = this.contentEl as any;
    const closeHandler = (e: MouseEvent) => {
      if (!dropdown.contains(e.target as Node)) {
        dropdown.remove();
        contentElAny.off("click", closeHandler);
      }
    };

    setTimeout(() => {
      contentElAny.on("click", closeHandler);
    }, 10);

    // Position: anchored bottom-right of the trigger button
    const btn = this.contentEl.querySelector(".fc-viewSelector-button") as HTMLElement;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const containerRect = this.contentEl.getBoundingClientRect();
      dropdown.style.top = `${rect.bottom - containerRect.top + 4}px`;
      dropdown.style.right = `0px`;
    }
  }

  private changeView(viewId: string) {
    if (this.calendar) {
      this.calendar.changeView(viewId);
      // Update button text
      const btn = this.contentEl.querySelector(".fc-viewSelector-button") as HTMLElement;
      if (btn) {
        const labels: Record<string, string> = {
          dayGridMonth: "Month",
          timeGridWeek: "Week",
          timeGridDay: "Day",
          listWeek: "List",
        };
        btn.textContent = labels[viewId] || "Month";
      }
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
    }, 300);
  }

  // ── Cleanup ─────────────────────────────────────────────────

  override async onClose() {
    if (this._dataUpdateTimer) {
      clearTimeout(this._dataUpdateTimer);
      this._dataUpdateTimer = null;
    }
    if (this.calendar) {
      this.calendar.destroy();
      this.calendar = null;
    }
  }
}
