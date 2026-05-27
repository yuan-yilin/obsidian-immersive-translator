import type { SpawnedProcess, SpawnOptions } from "@anthropic-ai/claude-agent-sdk";
import { spawn } from "child_process";
import { cliPathRequiresNode, findNodeExecutable } from "../utils/env";

export function createCustomSpawnFunction(enhancedPath: string): (options: SpawnOptions) => SpawnedProcess {
  return (options: SpawnOptions): SpawnedProcess => {
    let { command, args } = options;
    const { cwd, env, signal } = options;
    const shouldPipeStderr = Boolean(env?.DEBUG_CLAUDE_AGENT_SDK);

    if (command === "node" || cliPathRequiresNode(command)) {
      const nodePath = findNodeExecutable(enhancedPath);
      if (command === "node") {
        command = nodePath ?? command;
      } else {
        args = [command, ...args];
        command = nodePath ?? "node";
      }
    }

    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", shouldPipeStderr ? "pipe" : "ignore"],
      windowsHide: true,
    });

    if (signal) {
      if (signal.aborted) {
        child.kill();
      } else {
        signal.addEventListener("abort", () => child.kill(), { once: true });
      }
    }

    if (shouldPipeStderr && child.stderr && typeof child.stderr.on === "function") {
      child.stderr.on("data", () => undefined);
    }

    if (!child.stdin || !child.stdout) {
      throw new Error("Failed to create Claude CLI process streams");
    }

    return child as unknown as SpawnedProcess;
  };
}
