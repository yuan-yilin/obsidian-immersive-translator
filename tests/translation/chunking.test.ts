import { describe, expect, it } from "vitest";
import { splitTextIntoChunks } from "../../src/translation/chunking";

describe("splitTextIntoChunks", () => {
  it("returns the original text when it fits in one chunk", () => {
    expect(splitTextIntoChunks("short text", 500)).toEqual(["short text"]);
  });

  it("splits at paragraph boundaries and preserves all content", () => {
    const text = `${"A".repeat(490)}\n\n${"B".repeat(490)}\n\n${"C".repeat(120)}`;
    const chunks = splitTextIntoChunks(text, 500);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(text);
  });

  it("keeps fenced code blocks together", () => {
    const text = "Intro paragraph.\n\n```ts\nconst value = 'do not split';\nconsole.log(value);\n```\n\nFinal paragraph.";
    const chunks = splitTextIntoChunks(text, 30);

    const codeChunk = chunks.find((chunk) => chunk.includes("const value"));
    expect(codeChunk).toContain("```ts");
    expect(codeChunk).toContain("```\n\n");
    expect(chunks.join("")).toBe(text);
  });

  it("keeps YAML frontmatter together", () => {
    const text = `---\ntitle: Test\ntags:\n  - translation\n---\n\n${"Body paragraph. ".repeat(40)}\n\nAnother paragraph.`;
    const chunks = splitTextIntoChunks(text, 500);

    expect(chunks[0]).toBe("---\ntitle: Test\ntags:\n  - translation\n---\n\n");
    expect(chunks.join("")).toBe(text);
  });
});
