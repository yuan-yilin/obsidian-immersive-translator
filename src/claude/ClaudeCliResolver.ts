import * as fs from "fs";
import { getEnhancedPath, parseEnvironmentVariables } from "../utils/env";
import { expandHomePath } from "../utils/path";
import { findClaudeCLIPath } from "./findClaudeCLIPath";

export class ClaudeCliResolver {
  private resolvedPath: string | null = null;
  private lastConfiguredPath = "";
  private lastAutoDetect = true;
  private lastPathValue = "";

  resolve(configuredPath: string, autoDetect: boolean, pathValue: string): string | null {
    const normalizedConfiguredPath = configuredPath.trim();
    if (
      this.resolvedPath &&
      this.lastConfiguredPath === normalizedConfiguredPath &&
      this.lastAutoDetect === autoDetect &&
      this.lastPathValue === pathValue
    ) {
      return this.resolvedPath;
    }

    this.lastConfiguredPath = normalizedConfiguredPath;
    this.lastAutoDetect = autoDetect;
    this.lastPathValue = pathValue;
    this.resolvedPath = resolveClaudeCliPath(normalizedConfiguredPath, autoDetect, pathValue);
    return this.resolvedPath;
  }

  reset(): void {
    this.resolvedPath = null;
    this.lastConfiguredPath = "";
    this.lastAutoDetect = true;
    this.lastPathValue = "";
  }
}

export function resolveClaudeCliPath(configuredPath: string, autoDetect: boolean, pathValue: string): string | null {
  return resolveConfiguredPath(configuredPath) ?? (autoDetect ? findClaudeCLIPath(pathValue) : null);
}

export function buildClaudeEnvironment(cliPath: string): Record<string, string> {
  const env = parseEnvironmentVariables("");
  return {
    ...process.env,
    ...env,
    PATH: getEnhancedPath(process.env.PATH, cliPath),
  } as Record<string, string>;
}

function resolveConfiguredPath(rawPath: string): string | null {
  if (!rawPath) return null;
  try {
    const expanded = expandHomePath(rawPath);
    if (fs.existsSync(expanded) && fs.statSync(expanded).isFile()) {
      return expanded;
    }
  } catch {
    return null;
  }
  return null;
}
