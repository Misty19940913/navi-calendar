import { App, TFile } from "obsidian";
import { parseWikilinkLink, fileExists } from "../utils/linkUtils";

export interface WikilinkMatch {
  match: string;       // Full match text including [[ ]]
  linkPath: string;    // The path inside the brackets
  title: string;       // The title (last part after /)
  start: number;       // Start position in text
  end: number;         // End position in text
}

export class TaskLinkDetectionService {
  private app: App;
  private taskFolder: string;

  constructor(app: App, taskFolder: string) {
    this.app = app;
    this.taskFolder = taskFolder.endsWith("/") ? taskFolder : taskFolder + "/";
  }

  /**
   * Find all wikilinks in the given text.
   */
  findWikilinks(text: string): WikilinkMatch[] {
    const results: WikilinkMatch[] = [];
    const regex = /\[\[([^\]]+)\]\]/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const inner = match[1];
      const parsed = parseWikilinkLink(`[[${inner}]]`);
      if (!parsed) continue;

      results.push({
        match: match[0],
        linkPath: parsed.linkPath,
        title: parsed.title,
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    return results;
  }

  /**
   * Check if a wikilink points to a non-existent task file.
   * Returns true if the link appears to be a task link (points to taskFolder)
   * but the file does not exist yet.
   */
  isMissingTaskLink(linkPath: string): boolean {
    if (!this.taskFolder) return false;

    // Normalize for comparison — strip trailing / if present
    const normalizedLinkPath = linkPath.endsWith("/")
      ? linkPath.slice(0, -1)
      : linkPath;
    const normalizedTaskFolder = this.taskFolder.endsWith("/")
      ? this.taskFolder.slice(0, -1)
      : this.taskFolder;

    if (!normalizedLinkPath.startsWith(normalizedTaskFolder)) {
      return false;
    }

    // Check if file exists
    const file = this.app.vault.getAbstractFileByPath(linkPath);
    return !(file instanceof TFile);
  }

  /**
   * Given a wikilink match, determine if it's a missing task link.
   */
  detectTaskLink(wikilink: WikilinkMatch): boolean {
    return this.isMissingTaskLink(wikilink.linkPath);
  }

  /**
   * Refresh the task folder setting.
   */
  updateTaskFolder(taskFolder: string): void {
    this.taskFolder = taskFolder.endsWith("/") ? taskFolder : taskFolder + "/";
  }
}
