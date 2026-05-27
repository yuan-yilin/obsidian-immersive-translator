import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { parsePathEntries } from "./path";

export function parseEnvironmentVariables(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key) env[key] = value;
  }
  return env;
}

export function getEnhancedPath(pathValue: string | undefined, cliPath: string): string {
  const entries = parsePathEntries(pathValue ?? process.env.PATH);
  const extraEntries = [
    path.dirname(cliPath),
    path.join(os.homedir(), ".local", "bin"),
    path.join(os.homedir(), ".claude", "local"),
    path.join(os.homedir(), ".volta", "bin"),
    path.join(os.homedir(), ".asdf", "shims"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ];

  return dedupePaths([...extraEntries, ...entries]).join(path.delimiter);
}

export function cliPathRequiresNode(command: string): boolean {
  return /\.(cjs|mjs|js)$/i.test(command) || command.includes(`${path.sep}@anthropic-ai${path.sep}claude-code${path.sep}`);
}

export function findNodeExecutable(pathValue?: string): string | null {
  for (const entry of parsePathEntries(pathValue ?? process.env.PATH)) {
    const candidate = path.join(entry, process.platform === "win32" ? "node.exe" : "node");
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function getMissingNodeError(cliPath: string, pathValue: string): string | null {
  if (!cliPathRequiresNode(cliPath)) return null;
  if (findNodeExecutable(pathValue)) return null;
  return "Claude CLI entrypoint requires Node.js, but no node executable was found in PATH.";
}

function dedupePaths(entries: string[]): string[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (!entry) return false;
    const key = process.platform === "win32" ? entry.toLowerCase() : entry;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
