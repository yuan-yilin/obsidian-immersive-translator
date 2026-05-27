import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TranslatorConfig } from "../../src/translation/translator";

const runClaudeTranslation = vi.fn();

vi.mock("../../src/claude/claudeTranslate", () => ({
  runClaudeTranslation,
}));

const config: TranslatorConfig = {
  claudePath: "/usr/local/bin/claude",
  model: "sonnet",
  sourceLang: "en",
  targetLang: "zh",
  preserveMarkdown: true,
  chunkSize: 500,
  vaultPath: "/tmp/vault",
};

describe("translator flow", () => {
  beforeEach(() => {
    runClaudeTranslation.mockReset();
  });

  it("returns blank text unchanged without invoking Claude", async () => {
    const { translateText } = await import("../../src/translation/translator");

    await expect(translateText(config, "   \n")).resolves.toBe("   \n");
    expect(runClaudeTranslation).not.toHaveBeenCalled();
  });

  it("validates Claude CLI path before translating", async () => {
    const { translateText } = await import("../../src/translation/translator");

    await expect(translateText({ ...config, claudePath: null }, "Hello")).rejects.toThrow("Claude CLI not found");
    expect(runClaudeTranslation).not.toHaveBeenCalled();
  });

  it("translates short text with a single Claude call", async () => {
    runClaudeTranslation.mockResolvedValueOnce("你好");
    const { translateText } = await import("../../src/translation/translator");

    await expect(translateText(config, "Hello")).resolves.toBe("你好");
    expect(runClaudeTranslation).toHaveBeenCalledTimes(1);
    expect(runClaudeTranslation.mock.calls[0][1]).toContain("Hello");
    expect(runClaudeTranslation.mock.calls[0][2]).toContain("English");
  });

  it("streams through the accumulated text callback", async () => {
    runClaudeTranslation.mockImplementationOnce(async (_config, _prompt, _systemPrompt, options) => {
      options.onAccumulatedText?.("你");
      options.onAccumulatedText?.("你好");
      return "你好";
    });
    const { translateTextStreaming } = await import("../../src/translation/translator");
    const updates: string[] = [];

    await expect(translateTextStreaming(config, "Hello", (text) => updates.push(text))).resolves.toBe("你好");
    expect(updates).toEqual(["你", "你好"]);
  });

  it("translates multi-chunk text sequentially and joins results", async () => {
    runClaudeTranslation
      .mockResolvedValueOnce("第一段。\n\n")
      .mockResolvedValueOnce("第二段。");
    const { translateText } = await import("../../src/translation/translator");
    const longConfig = { ...config, chunkSize: 500 };
    const text = `${"A".repeat(490)}\n\n${"B".repeat(490)}`;

    await expect(translateText(longConfig, text)).resolves.toBe("第一段。\n\n第二段。");
    expect(runClaudeTranslation).toHaveBeenCalledTimes(2);
    expect(runClaudeTranslation.mock.calls[0][1]).toContain("part 1 of 2");
    expect(runClaudeTranslation.mock.calls[1][1]).toContain("part 2 of 2");
  });

  it("batchTranslate skips empty text and reports progress", async () => {
    runClaudeTranslation
      .mockResolvedValueOnce("一")
      .mockResolvedValueOnce("二");
    const { batchTranslate } = await import("../../src/translation/translator");
    const progress: Array<[number, number]> = [];

    const result = await batchTranslate(config, ["one", "", "two"], (completed, total) => {
      progress.push([completed, total]);
    });

    expect([...result.entries()]).toEqual([["one", "一"], ["two", "二"]]);
    expect(progress).toEqual([[1, 2], [2, 2]]);
  });

  it("stops before calling Claude when the signal is already aborted", async () => {
    const { translateText } = await import("../../src/translation/translator");
    const abortController = new AbortController();
    abortController.abort();
    const text = `${"A".repeat(490)}\n\n${"B".repeat(490)}`;

    await expect(translateText(config, text, { signal: abortController.signal })).rejects.toThrow("翻译已取消");
    expect(runClaudeTranslation).not.toHaveBeenCalled();
  });
});
