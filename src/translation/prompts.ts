import { getPromptLanguageName } from "./languages";
import { TranslatorConfig } from "./translator";

export function buildTranslationSystemPrompt(config: TranslatorConfig): string {
  const source = getPromptLanguageName(config.sourceLang);
  const target = getPromptLanguageName(config.targetLang);

  return `You are a professional translator. Translate text from ${source} to ${target}.

Rules:
1. Preserve the original Markdown structure exactly.
2. Translate only natural language prose.
3. Do not modify YAML frontmatter keys, code fences, inline code, math, HTML tags, URLs, file paths, Obsidian wiki links, block IDs, or embeds.
4. Preserve headings, lists, task list markers, tables, blockquotes, callout syntax, footnotes, whitespace, and line breaks as much as possible.
5. Keep technical terms accurate and widely accepted.
6. If the text is already in the target language or has no translatable prose, return it unchanged.
7. Output only the translated text. Do not add explanations, notes, quotes, or Markdown fences.`;
}

export function buildTranslationPrompt(text: string): string {
  return `Translate the following text and return only the translated result:\n\n${text}`;
}

export function buildChunkTranslationPrompt(text: string, index: number, total: number): string {
  if (total <= 1) {
    return buildTranslationPrompt(text);
  }

  return `Translate part ${index + 1} of ${total}. Return only this part's translated result and do not summarize neighboring parts.\n\n${text}`;
}
