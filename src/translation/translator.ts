import { runClaudeTranslation } from "../claude/claudeTranslate";
import { buildChunkTranslationPrompt, buildTranslationPrompt, buildTranslationSystemPrompt } from "./prompts";
import { splitTextIntoChunks } from "./chunking";

export interface TranslatorConfig {
  claudePath: string | null;
  model: string;
  sourceLang: string;
  targetLang: string;
  preserveMarkdown: boolean;
  chunkSize: number;
  vaultPath: string | null;
}

export interface TranslateOptions {
  signal?: AbortSignal;
  onAccumulatedText?: (text: string) => void;
}

export async function translateText(
  config: TranslatorConfig,
  text: string,
  options: TranslateOptions = {},
): Promise<string> {
  if (!text.trim()) return text;
  ensureTranslatorConfig(config);

  const chunks = splitTextIntoChunks(text, config.chunkSize);
  if (chunks.length === 1) {
    return runClaudeTranslation(config, buildTranslationPrompt(text), buildTranslationSystemPrompt(config), options);
  }

  const translated: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    throwIfAborted(options.signal);
    translated.push(await runClaudeTranslation(
      config,
      buildChunkTranslationPrompt(chunks[i], i, chunks.length),
      buildTranslationSystemPrompt(config),
      options,
    ));
  }
  return translated.join("");
}

export async function translateTextStreaming(
  config: TranslatorConfig,
  text: string,
  onAccumulatedText: (text: string) => void,
  options: Omit<TranslateOptions, "onAccumulatedText"> = {},
): Promise<string> {
  return translateText(config, text, { ...options, onAccumulatedText });
}

export async function batchTranslate(
  config: TranslatorConfig,
  texts: string[],
  onProgress?: (completed: number, total: number) => void,
  options: TranslateOptions = {},
): Promise<Map<string, string>> {
  ensureTranslatorConfig(config);
  const result = new Map<string, string>();
  const toTranslate = texts.filter((text) => text.trim());

  for (let i = 0; i < toTranslate.length; i++) {
    throwIfAborted(options.signal);
    const text = toTranslate[i];
    const translated = await translateText(config, text, options);
    result.set(text, translated);
    onProgress?.(i + 1, toTranslate.length);
  }

  return result;
}

export async function testClaudeCli(config: TranslatorConfig): Promise<string> {
  return translateText(config, "Hello, this is a translation test.");
}

function ensureTranslatorConfig(config: TranslatorConfig): asserts config is TranslatorConfig & { claudePath: string; vaultPath: string } {
  if (!config.claudePath) {
    throw new Error("Claude CLI not found. Configure the Claude CLI path in plugin settings.");
  }
  if (!config.vaultPath) {
    throw new Error("Could not determine the local vault path.");
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("翻译已取消");
  }
}
