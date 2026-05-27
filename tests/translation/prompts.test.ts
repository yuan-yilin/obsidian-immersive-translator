import { describe, expect, it } from "vitest";
import { buildChunkTranslationPrompt, buildTranslationPrompt, buildTranslationSystemPrompt } from "../../src/translation/prompts";
import type { TranslatorConfig } from "../../src/translation/translator";

const config: TranslatorConfig = {
  claudePath: "/usr/local/bin/claude",
  model: "sonnet",
  sourceLang: "auto",
  targetLang: "zh",
  preserveMarkdown: true,
  chunkSize: 3000,
  vaultPath: "/tmp/vault",
};

describe("translation prompts", () => {
  it("builds a system prompt with language and preservation rules", () => {
    const prompt = buildTranslationSystemPrompt(config);

    expect(prompt).toContain("auto-detected language");
    expect(prompt).toContain("中文");
    expect(prompt).toContain("Preserve the original Markdown structure");
    expect(prompt).toContain("Obsidian wiki links");
    expect(prompt).toContain("Output only the translated text");
  });

  it("wraps raw text in a translation prompt", () => {
    expect(buildTranslationPrompt("Hello")).toBe("Translate the following text and return only the translated result:\n\nHello");
  });

  it("adds chunk position for multi-part translation", () => {
    const prompt = buildChunkTranslationPrompt("Part content", 1, 3);

    expect(prompt).toContain("part 2 of 3");
    expect(prompt).toContain("Part content");
  });

  it("uses normal prompt for single chunk", () => {
    expect(buildChunkTranslationPrompt("Only content", 0, 1)).toBe(buildTranslationPrompt("Only content"));
  });
});
