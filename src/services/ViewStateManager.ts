import NaviCalendarPlugin from "../main";
import { ViewState } from "../types";
import { format } from "date-fns";

// ──────────────────────────────────────────────────────────────
// NOTE: This service is not yet wired up. The view state
// (current date, view type, last refresh) is tracked in-memory
// by CalendarView. Persistence of view state across reloads
// is a Phase 2+ feature.
//
// To enable: call viewStateManager.saveCurrentView() from
// CalendarView when the user navigates or changes view type.
// ──────────────────────────────────────────────────────────────

export class ViewStateManager {
  private plugin: NaviCalendarPlugin;

  constructor(plugin: NaviCalendarPlugin) {
    this.plugin = plugin;
  }

  async saveViewState(state: ViewState): Promise<void> {
    // TODO (Phase 2): Persist to settings
    // this.plugin.settings.lastViewState = state;
    // await this.plugin.saveSettings();
    void state; // suppress unused warning
  }

  getViewState(): ViewState | null {
    // TODO (Phase 2): Read from settings
    // return (this.plugin.settings as any).lastViewState || null;
    return null;
  }

  async saveCurrentView(type: ViewState["viewType"], currentDate: Date): Promise<void> {
    const state: ViewState = {
      viewType: type,
      currentDate: format(currentDate, "yyyy-MM-dd"),
      openDirection: this.plugin.settings.openDirection,
      lastRefresh: Date.now(),
    };
    await this.saveViewState(state);
  }
}
