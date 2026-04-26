import { ItemView, WorkspaceLeaf } from "obsidian";
import NaviCalendarPlugin from "../main";
import { TIMELINE_VIEW_TYPE } from "../types";

export class TimelineView extends ItemView {
  private plugin: NaviCalendarPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: NaviCalendarPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  override getViewType(): string {
    return TIMELINE_VIEW_TYPE;
  }

  override getDisplayText(): string {
    return "Timeline";
  }

  override getIcon(): string {
    return "calendar";
  }

  override async onOpen() {
    this.contentEl.empty();
    const placeholder = this.contentEl.createDiv("navi-timeline-placeholder");
    placeholder.setText("📅 Timeline View — Coming in Phase 3");
  }

  override async onClose() {
    // Noop — placeholder has no state
  }
}
