import { TFile, Notice } from "obsidian";
import type NaviCalendarPlugin from "../main";
import type { LogLevel } from "../types";

/**
 * Log entry structure.
 * Written to in-memory ring buffer (hot path, zero I/O)
 * and periodically flushed to vault Markdown file (cold path).
 */
export interface LogEntry {
  timestamp: string;   // ISO 8601
  level: LogLevel;     // "error" | "warn" | "info" | "debug"
  source: string;      // Service/class name, e.g. "TaskService", "TaskLinkOverlay"
  message: string;     // Human-readable description
  context?: Record<string, unknown>; // Structured extra data (IDs, counts, etc.)
}

/**
 * In-memory ring buffer with fixed max size.
 * Oldest entries are evicted when capacity is reached.
 */
export class LogRingBuffer {
  private buffer: LogEntry[] = [];
  private maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  push(entry: LogEntry): void {
    if (this.buffer.length >= this.maxSize) {
      this.buffer.shift(); // Evict oldest
    }
    this.buffer.push(entry);
  }

  getAll(): LogEntry[] {
    return [...this.buffer];
  }

  getByLevel(level: LogLevel): LogEntry[] {
    return this.buffer.filter((e) => e.level === level);
  }

  clear(): void {
    this.buffer = [];
  }

  get size(): number {
    return this.buffer.length;
  }
}

/**
 * LogService — dual-track logging for navi-calendar.
 *
 * Hot path  (zero I/O):  push() → ring buffer
 * Cold path (batch I/O): flushToFile() → vault .md log file
 *
 * Log file path: {vault}/.navi-calendar-logs/{YYYY-MM-DD}.md
 */
export class LogService {
  private plugin: NaviCalendarPlugin;
  private ring: LogRingBuffer;
  private flushThreshold: number;   // flush after N entries
  private entryCount = 0;          // entries since last flush
  private flushTimer: number | null = null;
  private readonly FLUSH_INTERVAL_MS = 60_000; // 1 minute max age

  /** Log file folder inside vault */
  private readonly LOG_FOLDER = ".navi-calendar-logs";

  constructor(plugin: NaviCalendarPlugin, ringMaxSize = 500, flushThreshold = 30) {
    this.plugin = plugin;
    this.ring = new LogRingBuffer(ringMaxSize);
    this.flushThreshold = flushThreshold;
  }

  // ── Public API ─────────────────────────────────────────────────

  error(source: string, message: string, context?: Record<string, unknown>): void {
    this.log("error", source, message, context);
  }

  warn(source: string, message: string, context?: Record<string, unknown>): void {
    this.log("warn", source, message, context);
  }

  info(source: string, message: string, context?: Record<string, unknown>): void {
    this.log("info", source, message, context);
  }

  debug(source: string, message: string, context?: Record<string, unknown>): void {
    this.log("debug", source, message, context);
  }

  /**
   * Get all log entries from the in-memory ring buffer.
   * Useful for the settings tab log viewer.
   */
  getEntries(): LogEntry[] {
    return this.ring.getAll();
  }

  /** Get entries filtered by minimum level (obeys settings) */
  getEntriesByMinLevel(minLevel: LogLevel): LogEntry[] {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    const threshold = levels.indexOf(minLevel);
    return this.ring.getAll().filter((e) => levels.indexOf(e.level) >= threshold);
  }

  get size(): number {
    return this.ring.size;
  }

  /** Open the today's log file in a new Obsidian leaf */
  async openTodayLog(): Promise<void> {
    const today = this.todayFileName();
    await this.ensureLogFolderExists();
    const file = this.plugin.app.vault.getAbstractFileByPath(
      `${this.LOG_FOLDER}/${today}`
    );
    if (file instanceof TFile) {
      await this.plugin.app.workspace.getLeaf(true).openFile(file);
    } else {
      // Create empty log file for today if it doesn't exist
      await this.flushToFile();
      const newFile = this.plugin.app.vault.getAbstractFileByPath(
        `${this.LOG_FOLDER}/${today}`
      );
        if (newFile instanceof TFile) {
          await this.plugin.app.workspace.getLeaf(true).openFile(newFile);
      }
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  /**
   * Called by the plugin's onload() — starts the periodic flush timer.
   * Does NOT load old log files; only writes new entries from this session.
   */
  async onLoad(): Promise<void> {
    await this.ensureLogFolderExists();
    this.startFlushTimer();
    this.info("LogService", "LogService initialised", {
      ringMaxSize: 500,
      flushThreshold: this.flushThreshold,
      logFolder: this.LOG_FOLDER,
    });
  }

  /**
   * Called by the plugin's onunload() — flushes remaining entries
   * and stops the timer.
   */
  async onUnload(): Promise<void> {
    this.stopFlushTimer();
    await this.flushToFile();
    this.ring.clear();
    this.info("LogService", "LogService unloaded, flushed all entries");
  }

  // ── Private ───────────────────────────────────────────────────

  private log(level: LogLevel, source: string, message: string, context?: Record<string, unknown>): void {
    // Master switch — if disabled, discard everything
    if (!this.plugin.settings.logEnabled) return;

    // Honour the plugin's logLevel setting
    const settingLevel = this.plugin.settings.logLevel ?? "info";
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    if (levels.indexOf(level) < levels.indexOf(settingLevel)) {
      return; // Below minimum — discard
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      context,
    };

    this.ring.push(entry);
    this.entryCount++;

    // Also surface errors as Obsidian Notices so users see them immediately
    if (level === "error") {
      new Notice(`[navi-calendar] ${source}: ${message}`, 4000);
    }

    // Check if we need to flush
    if (this.entryCount >= this.flushThreshold) {
      this.entryCount = 0;
      // Fire-and-forget — don't block the hot path
      this.flushToFile().catch(() => {});
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = window.setInterval(() => {
      this.entryCount = 0;
      this.flushToFile().catch(() => {});
    }, this.FLUSH_INTERVAL_MS);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Append all buffered entries to the day's Markdown log file in vault.
   * Each session's entries are grouped under a `## HH:mm:ss` heading.
   * Creates the file with a frontmatter header if it doesn't exist.
   */
  private async flushToFile(): Promise<void> {
    const entries = this.ring.getAll();
    if (entries.length === 0) return;

    const fileName = this.todayFileName();
    const filePath = `${this.LOG_FOLDER}/${fileName}`;

    try {
      const existingFile = this.plugin.app.vault.getAbstractFileByPath(filePath);
      let existingContent = "";

      if (existingFile instanceof TFile) {
        existingContent = await this.plugin.app.vault.read(existingFile);
      } else {
        // New file — write frontmatter header
        existingContent = this.initialFileContent();
      }

      // Group entries by session (identified by minute-level timestamp)
      // For simplicity: append all entries under one session heading
      const sessionHeading = `## ${this.sessionLabel()}`;
      const newSection = this.formatEntries(entries);
      const updatedContent = existingContent + `\n${sessionHeading}\n${newSection}\n`;

      if (existingFile instanceof TFile) {
        await this.plugin.app.vault.modify(existingFile, updatedContent);
      } else {
        await this.plugin.app.vault.create(filePath, updatedContent);
      }

      // Clear ring after successful flush
      this.ring.clear();
    } catch (err) {
      // Swallow — logging should never crash the plugin
      console.error("[navi-calendar] LogService flush failed:", err);
    }
  }

  private async ensureLogFolderExists(): Promise<void> {
    try {
      const folder = this.plugin.app.vault.getAbstractFileByPath(this.LOG_FOLDER);
      if (!folder) {
        await this.plugin.app.vault.createFolder(this.LOG_FOLDER);
      }
    } catch {
      // Folder may already exist (race condition)
    }
  }

  private todayFileName(): string {
    return new Date().toISOString().slice(0, 10) + ".md"; // YYYY-MM-DD.md
  }

  private sessionLabel(): string {
    return new Date().toLocaleTimeString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }

  private initialFileContent(): string {
    const date = new Date().toISOString().slice(0, 10);
    return `---
title: navi-calendar Log ${date}
type: log
folder: ${this.LOG_FOLDER}
status: active
time_created: ${new Date().toISOString()}
time_modified: ${new Date().toISOString()}
parent: []
children: []
related: []
tags:
  - navi-calendar
  - navi-calendar/log
description: Daily log for navi-calendar plugin — auto-generated, do not delete
---

# navi-calendar 日誌 — ${date}

`;
  }

  private formatEntries(entries: LogEntry[]): string {
    const lines: string[] = [];
    for (const e of entries) {
      const ts = e.timestamp.replace("T", " ").slice(0, 19); // YYYY-MM-DD HH:mm:ss
      const contextStr = e.context
        ? ` \`${JSON.stringify(e.context)}\``
        : "";
      const levelPad = e.level.padEnd(5);
      lines.push(`- **[${ts}]** \`${levelPad}\` \`${e.source}\` ${e.message}${contextStr}`);
    }
    return lines.join("\n");
  }
}
