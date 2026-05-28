import { spawn } from "child_process";
import { getEnhancedPath, getMissingNodeError } from "../utils/env";
import type { TranslateOptions, TranslatorConfig } from "../translation/translator";
import { buildClaudeCommand } from "./customSpawn";

/**
 * Strip leading ```markdown / ``` and trailing ``` that Claude CLI
 * sometimes wraps around its output, even when told not to.
 * Only strips when the entire response is a single fenced block.
 */
function stripMarkdownFenceWrapper(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:markdown)?\s*\n([\s\S]*)\n```\s*$/);
  if (fenceMatch) {
    return fenceMatch[1];
  }
  return trimmed;
}

export async function runClaudeTranslation(
  config: TranslatorConfig & { claudePath: string; vaultPath: string },
  prompt: string,
  systemPrompt: string,
  options: TranslateOptions = {},
): Promise<string> {
  if (options.signal?.aborted) {
    throw new Error("翻译已取消");
  }

  const enhancedPath = getEnhancedPath(process.env.PATH, config.claudePath);
  const missingNodeError = getMissingNodeError(config.claudePath, enhancedPath);
  if (missingNodeError) {
    throw new Error(missingNodeError);
  }

  const { command, args } = buildClaudeCommand(config.claudePath, enhancedPath, systemPrompt, config.model);

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const child = spawn(command, args, {
      cwd: config.vaultPath,
      env: {
        ...process.env,
        PATH: enhancedPath,
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    const cleanup = () => {
      options.signal?.removeEventListener("abort", abort);
    };

    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const abort = () => {
      child.kill();
      rejectOnce(new Error("翻译已取消"));
    };

    options.signal?.addEventListener("abort", abort, { once: true });

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      options.onAccumulatedText?.(stdout);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      rejectOnce(error instanceof Error ? error : new Error(String(error)));
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      cleanup();

      if (code !== 0) {
        rejectOnce(new Error(buildClaudeCliError(code, signal, stderr)));
        return;
      }

      const trimmed = stripMarkdownFenceWrapper(stdout);
      if (!trimmed) {
        rejectOnce(new Error("Claude CLI returned an empty translation."));
        return;
      }

      settled = true;
      resolve(trimmed);
    });

    child.stdin?.end(prompt);
  });
}

function buildClaudeCliError(code: number | null, signal: NodeJS.Signals | null, stderr: string): string {
  const detail = stderr.trim();
  const suffix = detail ? `\n\n${detail}` : "";
  if (signal) {
    return `Claude CLI was terminated by ${signal}.${suffix}`;
  }
  return `Claude CLI exited with code ${code ?? "unknown"}.${suffix}`;
}
