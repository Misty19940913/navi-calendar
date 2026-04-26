import { ItemView, WorkspaceLeaf } from "obsidian";
import NaviCalendarPlugin from "../main";
import { MINI_CALENDAR_VIEW_TYPE } from "../types";

export class MiniCalendarView extends ItemView {
  private plugin: NaviCalendarPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: NaviCalendarPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  override getViewType(): string {
    return MINI_CALENDAR_VIEW_TYPE;
  }

  override getDisplayText(): string {
    return "Mini Calendar";
  }

  override getIcon(): string {
    return "calendar";
  }

  override async onOpen() {
    this.contentEl.empty();
    const placeholder = this.contentEl.createDiv("navi-mini-cal-placeholder");
    placeholder.setText("📅 Mini Calendar — Coming in Phase 4");
  }

  override async onClose() {
    // Noop — placeholder has no state
  }
}
