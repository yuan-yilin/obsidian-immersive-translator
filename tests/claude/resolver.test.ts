import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { ClaudeCliResolver, resolveClaudeCliPath } from "../../src/claude/ClaudeCliResolver";

const createdDirs: string[] = [];

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("Claude CLI resolver", () => {
  it("uses a valid configured path before auto-detection", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "translator-cli-"));
    createdDirs.push(dir);
    const cliPath = path.join(dir, "claude");
    fs.writeFileSync(cliPath, "#!/bin/sh\n");

    expect(resolveClaudeCliPath(cliPath, false, "")).toBe(cliPath);
  });

  it("returns null for invalid configured path when auto-detection is disabled", () => {
    expect(resolveClaudeCliPath("/definitely/missing/claude", false, "")).toBeNull();
  });

  it("auto-detects claude from the supplied PATH", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "translator-path-"));
    createdDirs.push(dir);
    const cliPath = path.join(dir, "claude");
    fs.writeFileSync(cliPath, "#!/bin/sh\n");

    expect(resolveClaudeCliPath("", true, dir)).toBe(cliPath);
  });

  it("caches and resets resolved paths", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "translator-cache-"));
    createdDirs.push(dir);
    const cliPath = path.join(dir, "claude");
    fs.writeFileSync(cliPath, "#!/bin/sh\n");

    const resolver = new ClaudeCliResolver();
    expect(resolver.resolve(cliPath, false, "")).toBe(cliPath);
    fs.rmSync(cliPath);
    expect(resolver.resolve(cliPath, false, "")).toBe(cliPath);
    resolver.reset();
    expect(resolver.resolve(cliPath, false, "")).toBeNull();
  });
});
