import { TaskInfo, TaskCreationData, TaskPriority } from "../types";

/**
 * Frontmatter parsing and serialization utilities
 * Standard format aligned with TaskNotes
 */

export interface ParsedFrontmatter {
  title: string;
  status: string;
  priority: TaskPriority;
  due?: string;
  scheduled?: string;
  startTime?: string;
  endTime?: string;
  recurrence?: string;
  blockedBy: string[];
  blocking: string[];
  subtasks: string[];
  projects: string[];
  tags: string[];
  reminder?: string[];
  created?: string;
  modified?: string;
  description: string;
}

/**
 * Parse frontmatter from markdown content
 */
export function parseTaskFrontmatter(content: string): ParsedFrontmatter {
  const result: ParsedFrontmatter = {
    title: "",
    status: " ",
    priority: "none",
    blockedBy: [],
    blocking: [],
    subtasks: [],
    projects: [],
    tags: [],
    description: "",
  };

  // Check for frontmatter delimiters
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  
  if (!fmMatch) {
    // No frontmatter, entire content is description
    result.description = content.trim();
    return result;
  }

  const frontmatterStr = fmMatch[1];
  result.description = fmMatch[2].trim();

  // Parse frontmatter lines
  const lines = frontmatterStr.split("\n");
  let currentKey = "";
  let currentValue: any = undefined;
  let inMultilineValue = false;
  let multilineBuffer: string[] = [];

  for (const line of lines) {
    // Handle multiline values (arrays)
    if (inMultilineValue) {
      if (line.match(/^\s+\[/)) {
        // Array continues
        multilineBuffer.push(line);
        continue;
      } else if (line.match(/^\s+\]/)) {
        // End of array
        multilineBuffer.push(line);
        currentValue = parseYamlArray(multilineBuffer.join("\n"));
        inMultilineValue = false;
        multilineBuffer = [];
      } else {
        multilineBuffer.push(line);
        continue;
      }
    }

    // Check for multiline array start
    if (line.match(/^\s+\w+:\s*\[$/)) {
      inMultilineValue = true;
      currentKey = line.match(/^\s+(\w+):/)?.[1] || "";
      multilineBuffer = [line];
      continue;
    }

    // Normal key-value pair
    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      // Save previous key-value
      if (currentKey) {
        assignFrontmatterValue(result, currentKey, currentValue);
      }
      
      currentKey = kvMatch[1];
      const rawValue = kvMatch[2].trim();
      
      if (rawValue === "" || rawValue === "~" || rawValue === "null") {
        currentValue = undefined;
      } else if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
        currentValue = rawValue.slice(1, -1);
      } else if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
        currentValue = rawValue.slice(1, -1);
      } else if (rawValue === "true") {
        currentValue = true;
      } else if (rawValue === "false") {
        currentValue = false;
      } else if (/^\d+$/.test(rawValue)) {
        currentValue = parseInt(rawValue);
      } else if (/^\d+\.\d+$/.test(rawValue)) {
        currentValue = parseFloat(rawValue);
      } else {
        currentValue = rawValue;
      }
    }
  }

  // Don't forget the last key-value
  if (currentKey) {
    assignFrontmatterValue(result, currentKey, currentValue);
  }

  // Extract title from description if not in frontmatter
  if (!result.title && result.description) {
    const titleMatch = result.description.match(/^#\s*(.+)$/m);
    if (titleMatch) {
      result.title = titleMatch[1].trim();
    }
  }

  return result;
}

function assignFrontmatterValue(result: ParsedFrontmatter, key: string, value: any) {
  switch (key) {
    case "title":
      result.title = value || "";
      break;
    case "status":
      result.status = value || " ";
      break;
    case "priority":
      result.priority = normalizePriority(value);
      break;
    case "due":
      result.due = value;
      break;
    case "scheduled":
      result.scheduled = value;
      break;
    case "startTime":
      result.startTime = value;
      break;
    case "endTime":
      result.endTime = value;
      break;
    case "recurrence":
      result.recurrence = value;
      break;
    case "blockedBy":
      result.blockedBy = normalizeArray(value);
      break;
    case "blocking":
      result.blocking = normalizeArray(value);
      break;
    case "subtasks":
      result.subtasks = normalizeArray(value);
      break;
    case "projects":
      result.projects = normalizeArray(value);
      break;
    case "tags":
      result.tags = normalizeArray(value);
      break;
    case "reminder":
      result.reminder = normalizeArray(value);
      break;
    case "created":
      result.created = value;
      break;
    case "modified":
      result.modified = value;
      break;
  }
}

function normalizeArray(value: any): string[] {
  if (Array.isArray(value)) {
    return value.map(v => String(v));
  }
  if (typeof value === "string") {
    // Could be inline YAML array like "[a, b, c]"
    if (value.startsWith("[") && value.endsWith("]")) {
      return value.slice(1, -1).split(",").map(s => s.trim().replace(/['"]/g, ""));
    }
    return [value];
  }
  return [];
}

function parseYamlArray(multilineStr: string): string[] {
  const lines = multilineStr.split("\n");
  const items: string[] = [];
  
  for (const line of lines) {
    const itemMatch = line.match(/^\s*-\s*(.+)/);
    if (itemMatch) {
      let item = itemMatch[1].trim();
      // Remove quotes
      if ((item.startsWith('"') && item.endsWith('"')) ||
          (item.startsWith("'") && item.endsWith("'"))) {
        item = item.slice(1, -1);
      }
      items.push(item);
    }
  }
  
  return items;
}

function normalizePriority(value: any): TaskPriority {
  if (!value) return "none";
  const str = String(value).toLowerCase();
  if (["high", "medium", "low", "urgent", "none"].includes(str)) {
    return str as TaskPriority;
  }
  return "none";
}

/**
 * Serialize TaskInfo to frontmatter string
 */
export function serializeTaskFrontmatter(
  task: Partial<TaskInfo> & { title: string },
  existingContent?: string
): { frontmatter: string; body: string } {
  // Start with existing frontmatter if provided
  const fm: Record<string, any> = {
    type: "task",
    title: task.title,
    status: task.status || " ",
    priority: task.priority || "none",
    created: task.dateCreated || new Date().toISOString(),
    modified: new Date().toISOString(),
  };

  if (task.due) fm.due = task.due;
  if (task.scheduled) fm.scheduled = task.scheduled;
  if (task.startTime) fm.startTime = task.startTime;
  if (task.endTime) fm.endTime = task.endTime;
  if (task.recurrence) fm.recurrence = task.recurrence;
  if (task.blockedBy && task.blockedBy.length > 0) fm.blockedBy = task.blockedBy;
  if (task.blocking && task.blocking.length > 0) fm.blocking = task.blocking;
  if (task.subtasks && task.subtasks.length > 0) fm.subtasks = task.subtasks;
  if (task.projects && task.projects.length > 0) fm.projects = task.projects;
  if (task.tags && task.tags.length > 0) fm.tags = task.tags;
  if (task.reminder && task.reminder.length > 0) fm.reminder = task.reminder;

  // Serialize frontmatter to YAML-like string
  const fmLines = Object.entries(fm).map(([k, v]) => {
    if (Array.isArray(v)) {
      if (v.length === 0) return `${k}: []`;
      return `${k}:\n${v.map(item => `  - "${item}"`).join("\n")}`;
    }
    if (typeof v === "string" && (v.includes(":") || v.includes('"') || v.includes("'"))) {
      return `${k}: "${v.replace(/"/g, '\\"')}"`;
    }
    return `${k}: ${v}`;
  });

  const frontmatter = `---\n${fmLines.join("\n")}\n---`;

  // Body is existing content or just title
  const body = existingContent || `# ${task.title}\n\n`;

  return { frontmatter, body };
}

/**
 * Build complete markdown file content from task data
 */
export function buildTaskContent(task: Partial<TaskInfo> & { title: string }): string {
  const { frontmatter, body } = serializeTaskFrontmatter(task);
  return `${frontmatter}\n\n${body}`;
}

/**
 * Update frontmatter in existing content
 */
export function updateFrontmatterInContent(
  content: string,
  updates: Partial<TaskInfo>
): string {
  const parsed = parseTaskFrontmatter(content);
  
  // Apply updates
  const updated = { ...parsed, ...updates };
  const { frontmatter, body: originalBody } = serializeTaskFrontmatter(updated);
  
  // Keep original body structure
  const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  const body = bodyMatch ? bodyMatch[1] : originalBody;
  
  return `${frontmatter}\n\n${body}`;
}