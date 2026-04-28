import { App, TFile } from "obsidian";

/**
 * Parse a wikilink string like "[[Some Task]]" or "[[tasks/Some Task]]"
 * and extract the link path and title.
 */
export function parseWikilinkLink(text: string): { linkPath: string; title: string } | null {
  const match = text.match(/^\[\[([^\]]+)\]\]$/);
  if (!match) return null;

  const inner = match[1];
  const lastSlash = inner.lastIndexOf("/");

  if (lastSlash === -1) {
    // No folder prefix — title is the whole thing
    return { linkPath: inner, title: inner };
  }

  const linkPath = inner;
  const title = inner.substring(lastSlash + 1);
  return { linkPath, title };
}

/**
 * Resolve a link path relative to a source file path.
 * Uses Obsidian's metadataCache for proper link resolution.
 */
export function resolvePath(
  app: App,
  linkPath: string,
  sourcePath: string
): string | null {
  // Try to find the file directly using metadataCache
  const file = app.metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
  if (file) return file.path;
  return null;
}

/**
 * Check if a file exists at the given path.
 */
export function fileExists(app: App, path: string): boolean {
  const file = app.vault.getAbstractFileByPath(path);
  return file instanceof TFile;
}

/**
 * Generate a slug from a title for use in filenames.
 * When title produces a slug > 45 chars, append a collision-resistant hash suffix.
 */
export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);

  if (base.length > 45) {
    // Use first 40 chars + 4-char hash of the original full title
    const hash = Math.abs(hashCode(title)).toString(36).substring(0, 4);
    return base.substring(0, 40) + "-" + hash;
  }
  return base;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

/**
 * Strip .md extension if present, for consistent path comparison.
 */
export function normalizeFilePath(path: string): string {
  return path.endsWith(".md") ? path.slice(0, -3) : path;
}
