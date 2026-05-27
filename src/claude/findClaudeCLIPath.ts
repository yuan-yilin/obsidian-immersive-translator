import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { parsePathEntries, resolveNvmDefaultBin } from "../utils/path";

const CLAUDE_CODE_PACKAGE_SEGMENTS = ["node_modules", "@anthropic-ai", "claude-code"];
const CLAUDE_CODE_NODE_ENTRYPOINTS = ["cli-wrapper.cjs", "cli.js"];

export function findClaudeCLIPath(pathValue?: string): string | null {
  const homeDir = os.homedir();
  const isWindows = process.platform === "win32";
  const customEntries = dedupePaths(parsePathEntries(pathValue));

  const customResolution = resolveClaudeFromPathEntries(customEntries, isWindows);
  if (customResolution) return customResolution;

  const commonPaths = isWindows ? getWindowsClaudePaths(homeDir) : getUnixClaudePaths(homeDir);
  for (const candidate of commonPaths) {
    if (isExistingFile(candidate)) return candidate;
  }

  for (const candidate of getNpmClaudeCodeEntrypointPaths(homeDir, isWindows)) {
    if (isExistingFile(candidate)) return candidate;
  }

  const envResolution = resolveClaudeFromPathEntries(dedupePaths(parsePathEntries(process.env.PATH)), isWindows);
  return envResolution;
}

function getUnixClaudePaths(homeDir: string): string[] {
  const paths = [
    path.join(homeDir, ".claude", "local", "claude"),
    path.join(homeDir, ".local", "bin", "claude"),
    path.join(homeDir, ".volta", "bin", "claude"),
    path.join(homeDir, ".asdf", "shims", "claude"),
    path.join(homeDir, ".asdf", "bin", "claude"),
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
    path.join(homeDir, "bin", "claude"),
    path.join(homeDir, ".npm-global", "bin", "claude"),
  ];

  if (process.env.npm_config_prefix) {
    paths.push(path.join(process.env.npm_config_prefix, "bin", "claude"));
  }

  const nvmBin = resolveNvmDefaultBin(homeDir);
  if (nvmBin) {
    paths.push(path.join(nvmBin, "claude"));
  }

  return paths;
}

function getWindowsClaudePaths(homeDir: string): string[] {
  return [
    path.join(homeDir, ".claude", "local", "claude.exe"),
    path.join(homeDir, "AppData", "Local", "Claude", "claude.exe"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Claude", "claude.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Claude", "claude.exe"),
    path.join(homeDir, ".local", "bin", "claude.exe"),
  ];
}

function resolveClaudeFromPathEntries(entries: string[], isWindows: boolean): string | null {
  if (entries.length === 0) return null;
  const executableNames = isWindows ? ["claude.exe", "claude"] : ["claude"];

  for (const entry of entries) {
    for (const executableName of executableNames) {
      const candidate = path.join(entry, executableName);
      if (isExistingFile(candidate)) return candidate;
    }
  }

  return resolveClaudeCodeEntrypointFromPathEntries(entries, isWindows);
}

function resolveClaudeCodeEntrypointFromPathEntries(entries: string[], isWindows: boolean): string | null {
  for (const entry of entries) {
    const directCandidate = findClaudeCodeNodeEntrypoint(path.join(entry, ...CLAUDE_CODE_PACKAGE_SEGMENTS));
    if (directCandidate) return directCandidate;

    if (path.basename(entry).toLowerCase() === "bin") {
      const prefix = path.dirname(entry);
      const packageParent = isWindows ? prefix : path.join(prefix, "lib");
      const packageCandidate = findClaudeCodeNodeEntrypoint(path.join(packageParent, ...CLAUDE_CODE_PACKAGE_SEGMENTS));
      if (packageCandidate) return packageCandidate;
    }
  }

  return null;
}

function getNpmClaudeCodeEntrypointPaths(homeDir: string, isWindows: boolean): string[] {
  const paths: string[] = [];
  const addEntrypoints = (packageParent: string) => {
    const packageRoot = path.join(packageParent, ...CLAUDE_CODE_PACKAGE_SEGMENTS);
    for (const entrypoint of CLAUDE_CODE_NODE_ENTRYPOINTS) {
      paths.push(path.join(packageRoot, entrypoint));
    }
  };

  if (isWindows) {
    addEntrypoints(path.join(homeDir, "AppData", "Roaming", "npm"));
    if (process.env.APPDATA) addEntrypoints(process.env.APPDATA);
  } else {
    addEntrypoints(path.join(homeDir, ".npm-global", "lib"));
    addEntrypoints("/usr/local/lib");
    addEntrypoints("/usr/lib");
    if (process.env.npm_config_prefix) {
      addEntrypoints(path.join(process.env.npm_config_prefix, "lib"));
    }
  }

  return paths;
}

function findClaudeCodeNodeEntrypoint(packageRoot: string): string | null {
  for (const entrypoint of CLAUDE_CODE_NODE_ENTRYPOINTS) {
    const candidate = path.join(packageRoot, entrypoint);
    if (isExistingFile(candidate)) return candidate;
  }
  return null;
}

function isExistingFile(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function dedupePaths(entries: string[]): string[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = process.platform === "win32" ? entry.toLowerCase() : entry;
    if (!entry || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
