import { describe, it, expect } from "vitest";
import { extractStructure, compareStructures, repairMarkdown, validateAndRepair } from "../../src/translation/markdown-validator";

describe("extractStructure", () => {
  it("extracts headings from markdown text", () => {
    const text = `# Title
## Section
### Sub-section
Some content
## Another Section`;
    const structure = extractStructure(text);
    expect(structure.headings).toHaveLength(4);
    expect(structure.headings[0]).toEqual({ level: 1, line: 0 });
    expect(structure.headings[1]).toEqual({ level: 2, line: 1 });
    expect(structure.headings[2]).toEqual({ level: 3, line: 2 });
    expect(structure.headings[3]).toEqual({ level: 2, line: 4 });
  });

  it("detects code fences with language", () => {
    const text = `\`\`\`typescript
const x = 1;
\`\`\`
\`\`\`python
print("hello")
\`\`\``;
    const structure = extractStructure(text);
    // Both opening and closing fence lines are counted
    expect(structure.codeFences).toHaveLength(4);
    expect(structure.codeFences[0]).toEqual({ line: 0, lang: "typescript" });
    expect(structure.codeFences[2]).toEqual({ line: 3, lang: "python" });
  });

  it("detects YAML frontmatter", () => {
    const text = `---
title: Hello
date: 2024-01-01
---
# Content`;
    const structure = extractStructure(text);
    expect(structure.frontmatter).toBe(true);
    expect(structure.yamlFrontmatterLine).toBe(0);
  });

  it("counts table rows", () => {
    const text = `| Col1 | Col2 |
| ---- | ---- |
| A | B |
| C | D |`;
    const structure = extractStructure(text);
    expect(structure.tableRows).toBe(4);
  });

  it("detects blockquotes", () => {
    const text = `> This is a quote
> Continued

Regular text`;
    const structure = extractStructure(text);
    expect(structure.blockquotes).toHaveLength(2);
  });

  it("ignores headings inside code fences", () => {
    const text = `\`\`\`
# Not a heading
\`\`\`
# Real heading`;
    const structure = extractStructure(text);
    expect(structure.headings).toHaveLength(1);
    expect(structure.headings[0]).toEqual({ level: 1, line: 3 });
  });

  it("returns empty structure for plain text", () => {
    const text = "Just some plain text\nwith no markdown.";
    const structure = extractStructure(text);
    expect(structure.headings).toHaveLength(0);
    expect(structure.codeFences).toHaveLength(0);
    expect(structure.frontmatter).toBe(false);
  });
});

describe("compareStructures", () => {
  it("returns no issues for identical structures", () => {
    const s1 = extractStructure("# Title\n## Section\nSome text");
    const s2 = extractStructure("# Title\n## Section\nDifferent text");
    const issues = compareStructures(s1, s2);
    expect(issues).toHaveLength(0);
  });

  it("detects heading count mismatch", () => {
    const s1 = extractStructure("# A\n# B");
    const s2 = extractStructure("# A");
    const issues = compareStructures(s1, s2);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toContain("Headings count mismatch");
  });

  it("detects heading level mismatch", () => {
    const s1 = extractStructure("# A\n## B");
    const s2 = extractStructure("# A\n# B");
    const issues = compareStructures(s1, s2);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toContain("Heading level mismatch");
  });

  it("detects code fence mismatch", () => {
    const s1 = extractStructure("```js\ncode\n```");
    const s2 = extractStructure("```python\ncode\n```");
    const issues = compareStructures(s1, s2);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toContain("Code fence language mismatch");
  });

  it("detects frontmatter mismatch", () => {
    const s1 = extractStructure("---\nkey: val\n---\n# Title");
    const s2 = extractStructure("# Title");
    const issues = compareStructures(s1, s2);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toContain("YAML frontmatter");
  });
});

describe("validateAndRepair", () => {
  it("returns no issues when structures match", () => {
    const original = "# Title\n## Section\nSome translated text";
    const translated = "# Title\n## Section\nDifferent translated text";
    const result = validateAndRepair(original, translated);
    expect(result.hadIssues).toBe(false);
    expect(result.issues).toHaveLength(0);
    expect(result.repaired).toBe(translated);
  });

  it("flags issues when heading count differs", () => {
    const original = "# Title\n## Section\nContent";
    const translated = "# Title\nContent only";
    const result = validateAndRepair(original, translated);
    expect(result.hadIssues).toBe(true);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("preserves original translation when no repair needed", () => {
    const original = "# Hello\nWorld";
    const translated = "# Bonjour\nMonde";
    const result = validateAndRepair(original, translated);
    expect(result.repaired).toBe(translated);
    expect(result.hadIssues).toBe(false);
  });
});
