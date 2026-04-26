import { cp, mkdir } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const vault = "/mnt/c/Users/安泰/OneDrive/Obsidian/Navi Helios/.obsidian/plugins/navi-calendar";

async function copy() {
  await mkdir(vault, { recursive: true });
  await cp(join(root, "main.js"), join(vault, "main.js"), { force: true });
  await cp(join(root, "manifest.json"), join(vault, "manifest.json"), { force: true });
  await cp(join(root, "styles.css"), join(vault, "styles.css"), { force: true });
  console.log("[copy] ✅ Copied to vault:", vault);
}

copy().catch(console.error);
