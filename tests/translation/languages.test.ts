import { describe, expect, it } from "vitest";
import { getLanguageName, getPromptLanguageName, LANGUAGE_NAMES } from "../../src/translation/languages";

describe("language helpers", () => {
  it("returns display names for known language codes", () => {
    expect(LANGUAGE_NAMES.zh).toBe("中文");
    expect(getLanguageName("en")).toBe("English");
  });

  it("falls back to the code for unknown languages", () => {
    expect(getLanguageName("xx")).toBe("xx");
  });

  it("uses explicit wording for auto-detected source language in prompts", () => {
    expect(getPromptLanguageName("auto")).toBe("auto-detected language");
    expect(getPromptLanguageName("ja")).toBe("日本語");
  });
});
