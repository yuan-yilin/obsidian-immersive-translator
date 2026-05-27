import type { Options } from "@anthropic-ai/claude-agent-sdk";
import { query as agentQuery } from "@anthropic-ai/claude-agent-sdk";
import { getEnhancedPath, getMissingNodeError } from "../utils/env";
import type { TranslateOptions, TranslatorConfig } from "../translation/translator";
import { createCustomSpawnFunction } from "./customSpawn";

export async function runClaudeTranslation(
  config: TranslatorConfig & { claudePath: string; vaultPath: string },
  prompt: string,
  systemPrompt: string,
  options: TranslateOptions = {},
): Promise<string> {
  const abortController = new AbortController();
  if (options.signal) {
    if (options.signal.aborted) {
      abortController.abort();
    } else {
      options.signal.addEventListener("abort", () => abortController.abort(), { once: true });
    }
  }

  const enhancedPath = getEnhancedPath(process.env.PATH, config.claudePath);
  const missingNodeError = getMissingNodeError(config.claudePath, enhancedPath);
  if (missingNodeError) {
    throw new Error(missingNodeError);
  }

  const sdkOptions: Options = {
    cwd: config.vaultPath,
    systemPrompt,
    model: config.model || undefined,
    abortController,
    pathToClaudeCodeExecutable: config.claudePath,
    env: {
      ...process.env,
      PATH: enhancedPath,
    },
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    includePartialMessages: true,
    spawnClaudeCodeProcess: createCustomSpawnFunction(enhancedPath),
  };

  const response = agentQuery({ prompt, options: sdkOptions });
  let responseText = "";

  try {
    for await (const message of response) {
      if (abortController.signal.aborted) {
        await response.interrupt();
        throw new Error("翻译已取消");
      }

      const text = extractAssistantText(message as AssistantMessageLike);
      if (text) {
        responseText += text;
        options.onAccumulatedText?.(responseText);
      }
    }
  } catch (error) {
    if (abortController.signal.aborted) {
      throw new Error("翻译已取消");
    }
    throw error;
  }

  const trimmed = responseText.trim();
  if (!trimmed) {
    throw new Error("Claude CLI returned an empty translation.");
  }
  return trimmed;
}

interface AssistantMessageLike {
  type: string;
  message?: {
    content?: unknown;
  };
}

function extractAssistantText(message: AssistantMessageLike): string {
  const content = message.message?.content;
  if (message.type !== "assistant" || !Array.isArray(content)) {
    return "";
  }

  return content
    .filter((block): block is { type: "text"; text: string } => {
      if (!block || typeof block !== "object" || Array.isArray(block)) return false;
      const record = block as Record<string, unknown>;
      return record.type === "text" && typeof record.text === "string";
    })
    .map((block) => block.text)
    .join("");
}
