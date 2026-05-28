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
7. Output only the translated text. Do not add explanations, notes, quotes, or Markdown fences.
8. Do NOT wrap the entire response in any code fence.`;
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

export function buildValidationSystemPrompt(): string {
  return `You are a Markdown format validator. You will receive two documents: the ORIGINAL Markdown file and its TRANSLATED version. Your job is to ensure the translated version preserves the exact structural layout of the original.

Compare these structural elements between original and translated:
1. **Headings**: same count, same levels (H1-H6), same hierarchical order
2. **Code fences**: same count, same language identifiers, all fences properly closed
3. **YAML frontmatter**: present or absent in both, keys preserved
4. **Tables**: same number of columns and rows, separator lines intact
5. **List structures**: same nesting levels, same bullet/numbering style
6. **Blockquotes**: same nesting depth
7. **Horizontal rules**: same count
8. **Links and images**: same count and anchor/image syntax preserved
9. **Bold/italic markers**: consistent emphasis style
10. **Task list markers**: checkboxes preserved

Rules:
- If the structures match perfectly, return the translated text unchanged.
- If there are structural differences, fix the translated text to match the original structure while keeping all translated content intact.
- Output ONLY the final corrected translated text. No explanations, no notes, no code fence wrappers.`;
}

export function buildValidationPrompt(original: string, translated: string): string {
  const fenceOpen = "```";
  const fenceClose = "```";
  return `Validate and fix the markdown structure.

ORIGINAL:
${fenceOpen}markdown
${original}
${fenceClose}

TRANSLATED:
${fenceOpen}markdown
${translated}
${fenceClose}

Compare the structures. If they differ, fix the TRANSLATED version to match ORIGINAL structure. Return ONLY the corrected translated text.`;
}
