// ============================================================
// Navi Calendar Plugin — Types
// Life OS: Goal → Project → Task integration
// ============================================================

// ── View Types ──────────────────────────────────────────────
export const CALENDAR_VIEW_TYPE = "navi-calendar-main";
export const TIMELINE_VIEW_TYPE = "navi-calendar-timeline";
export const MINI_CALENDAR_VIEW_TYPE = "navi-calendar-mini";

// ── Event Types ──────────────────────────────────────────────
export const EVENT_DATA_CHANGED = "navi-calendar:data-changed";
export const EVENT_TASK_UPDATED = "navi-calendar:task-updated";
export const EVENT_TASK_CREATED = "navi-calendar:task-created";
export const EVENT_TASK_DELETED = "navi-calendar:task-deleted";

// ── Task Priority ─────────────────────────────────────────────
export type TaskPriority = "none" | "low" | "medium" | "high" | "urgent";

// ── Task Status ───────────────────────────────────────────────
export interface TaskStatus {
  symbol: string;      // e.g. " ", "x", "!"
  label: string;       // e.g. "Todo", "Done", "In Progress"
}

// ── Core Task Model ──────────────────────────────────────────
export interface TaskInfo {
  id: string;                    // Unique identifier (path + line number)
  title: string;                 // Task title
  status: string;                 // Status symbol or custom key
  priority: TaskPriority;
  due?: string;                  // YYYY-MM-DD
  scheduled?: string;             // YYYY-MM-DD
  startTime?: string;            // HH:mm — for timeblocks
  endTime?: string;              // HH:mm — for timeblocks
  path: string;                   // File path
  line: number;                  // Line number in file
  recurrence?: string;           // RFC 5545 recurrence rule
  recurrenceAnchor?: "scheduled" | "due"; // When recurrence repeats from
  blockedBy?: string[];           // Task IDs that block this one
  isBlocked?: boolean;            // Computed: any blocking task incomplete
  blockedByDependency?: TaskDependency[];
  completedDate?: string;        // YYYY-MM-DD when marked done
  dateCreated?: string;           // ISO timestamp
  tags?: string[];               // Inline tags
  projects?: string[];            // Project references
  sortOrder?: string;            // LexoRank for ordering
}

export interface TaskDependency {
  uid: string;                   // Blocking task ID
  reltype: "FINISHTOSTART" | "FINISHTOFINISH" | "STARTTOSTART" | "STARTTOFINISH";
  gap?: string;                  // ISO 8601 duration offset
}

// ── Task Creation / Edit ─────────────────────────────────────
export interface TaskCreationData {
  title: string;
  status?: string;
  priority?: TaskPriority;
  due?: string;
  scheduled?: string;
  startTime?: string;
  endTime?: string;
  recurrence?: string;
  tags?: string[];
  projects?: string[];
  path?: string;                // Override default path
}

export interface TaskEditData extends Partial<TaskCreationData> {
  completed?: boolean;          // Toggle completion
  delete?: boolean;              // Delete task
}

// ── FullCalendar Event ───────────────────────────────────────
export interface CalendarEvent {
  id: string;
  title: string;
  start: string;                // ISO date or datetime
  end?: string;
  allDay?: boolean;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
  extendedProps: {
    task: TaskInfo;
    isTimeblock: boolean;
    isRecurring: boolean;
    isBlocked: boolean;
  };
  editable?: boolean;
  durationEditable?: boolean;
  startEditable?: boolean;
}

// ── View State ───────────────────────────────────────────────
export interface ViewState {
  viewType: "dayGridMonth" | "timeGridWeek" | "timeGridDay" | "listWeek" | "timeline";
  currentDate: string;           // ISO date string
  openDirection: "replace" | "new-tab";
  lastRefresh: number;           // Timestamp
}

// ── Settings ─────────────────────────────────────────────────
export interface NaviCalendarSettings {
  // Calendar file
  journalFolder: string;          // e.g. "journal/" — user must set on first use
  journalTemplate: string;         // Template for daily notes (supports {{date}}, {{title}})

  // Appearance
  defaultView: ViewState["viewType"];
  firstDayOfWeek: number;        // 0=Sun, 1=Mon
  showWeekends: boolean;
  showWeekNumbers: boolean;

  // Task display
  showScheduled: boolean;
  showDue: boolean;
  showRecurring: boolean;

  // Colors
  priorityHighColor: string;
  priorityMediumColor: string;
  priorityLowColor: string;
  priorityUrgentColor: string;
  overdueColor: string;
  blockedColor: string;
  timeblockColor: string;

  // Navigation (CalendarView)
  openDirection: "replace" | "new-tab";

  // Mini calendar
  miniCalendarEnabled: boolean;
  miniCalendarSidebar: "left" | "right";

  // Status config
  statusConfig: Record<string, TaskStatus>;
}

export const DEFAULT_SETTINGS: Partial<NaviCalendarSettings> = {
  journalFolder: "",
  journalTemplate: `---\ndate: {{date}}\ntype: daily-note\nfolder: journal\ntags: [daily-note]\ntime_created: {{time_created}}\n---

# {{title}}

## Morning


## Afternoon


## Evening

## Tasks

## Notes
`,
  defaultView: "dayGridMonth",
  firstDayOfWeek: 1,
  showWeekends: true,
  showWeekNumbers: false,
  showScheduled: true,
  showDue: true,
  showRecurring: true,
  priorityHighColor: "#e53e3e",
  priorityMediumColor: "#dd6b20",
  priorityLowColor: "#38a169",
  priorityUrgentColor: "#805ad5",
  overdueColor: "#e53e3e",
  blockedColor: "#a0aec0",
  timeblockColor: "#3182ce",
  openDirection: "replace",
  miniCalendarEnabled: true,
  miniCalendarSidebar: "left",
  statusConfig: {
    " ": { symbol: " ", label: "Todo" },
    "x": { symbol: "x", label: "Done" },
    "-": { symbol: "-", label: "Cancelled" },
    ">": { symbol: ">", label: "In Progress" },
    "!": { symbol: "!", label: "Important" },
  },
};
