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
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);
}
