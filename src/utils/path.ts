import type { App } from "obsidian";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export function parsePathEntries(pathValue?: string): string[] {
  if (!pathValue) return [];
  return pathValue.split(path.delimiter).map((entry) => entry.trim()).filter(Boolean);
}

export function expandHomePath(filePath: string): string {
  if (filePath === "~") return os.homedir();
  if (filePath.startsWith(`~${path.sep}`)) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

export function resolveNvmDefaultBin(homeDir = os.homedir()): string | null {
  const aliasPath = path.join(homeDir, ".nvm", "alias", "default");
  try {
    if (!fs.existsSync(aliasPath)) return null;
    const version = fs.readFileSync(aliasPath, "utf8").trim();
    if (!version || version === "node") return null;
    const binPath = path.join(homeDir, ".nvm", "versions", "node", version, "bin");
    return fs.existsSync(binPath) ? binPath : null;
  } catch {
    return null;
  }
}

export function getVaultPath(app: App): string | null {
  const maybeAdapter = app.vault.adapter as { getBasePath?: () => string };
  if (typeof maybeAdapter.getBasePath === "function") {
    return maybeAdapter.getBasePath();
  }

  return null;
}
