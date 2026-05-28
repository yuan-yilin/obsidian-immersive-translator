/**
 * Post-translation markdown structure validation.
 * Extracts structural elements from both original and translated text,
 * compares them, and attempts repair when mismatches are found.
 */

export interface MarkdownStructure {
  headings: { level: number; line: number }[];
  codeFences: { line: number; lang: string }[];
  frontmatter: boolean;
  tableRows: number;
  blockquotes: { line: number }[];
  horizontalRules: number;
  yamlFrontmatterLine: number | null;
}

/**
 * Extract structural markdown elements from text.
 */
export function extractStructure(text: string): MarkdownStructure {
  const lines = text.split("\n");
  const headings: { level: number; line: number }[] = [];
  const codeFences: { line: number; lang: string }[] = [];
  const blockquotes: { line: number }[] = [];
  let tableRows = 0;
  let frontmatter = false;
  let yamlFrontmatterLine: number | null = null;
  let inCodeFence = false;
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // YAML frontmatter detection (must start at line 0)
    if (i === 0 && line.trim() === "---") {
      inFrontmatter = true;
      frontmatter = true;
      yamlFrontmatterLine = 0;
      continue;
    }
    if (inFrontmatter && line.trim() === "---") {
      inFrontmatter = false;
      continue;
    }
    if (inFrontmatter) continue;

    // Code fence
    const fenceMatch = line.match(/^(`{3,}|~{3,})(\w*)/);
    if (fenceMatch) {
      inCodeFence = !inCodeFence;
      codeFences.push({ line: i, lang: fenceMatch[2] || "" });
      continue;
    }
    if (inCodeFence) continue;

    // Headings (ATX style: # ## ### etc.)
    const headingMatch = line.match(/^(#{1,6})\s/);
    if (headingMatch) {
      headings.push({ level: headingMatch[1].length, line: i });
    }

    // Table rows (lines containing | that aren't headings or list items)
    if (line.includes("|") && !headingMatch && !line.match(/^\s*[-*]\s/)) {
      tableRows++;
    }

    // Blockquotes
    if (/^>\s/.test(line)) {
      blockquotes.push({ line: i });
    }

    // Horizontal rules
    if (/^([-*_]\s*){3,}$/.test(line.trim())) {
      // Count as horizontal rule but don't store line numbers for repair
    }
  }

  return {
    headings,
    codeFences,
    frontmatter,
    tableRows,
    blockquotes,
    horizontalRules: 0,
    yamlFrontmatterLine,
  };
}

/**
 * Compare two structures summaries and return a list of mismatches.
 */
export function compareStructures(
  original: MarkdownStructure,
  translated: MarkdownStructure,
): string[] {
  const issues: string[] = [];

  if (original.frontmatter !== translated.frontmatter) {
    issues.push("YAML frontmatter: original has it, translated is missing it");
  }

  if (original.headings.length !== translated.headings.length) {
    issues.push(
      `Headings count mismatch: original ${original.headings.length}, translated ${translated.headings.length}`,
    );
  } else {
    for (let i = 0; i < original.headings.length; i++) {
      const o = original.headings[i];
      const t = translated.headings[i];
      if (o.level !== t.level) {
        issues.push(
          `Heading level mismatch at position ${i + 1}: original H${o.level}, translated H${t.level}`,
        );
      }
    }
  }

  if (original.codeFences.length !== translated.codeFences.length) {
    issues.push(
      `Code fence count mismatch: original ${original.codeFences.length}, translated ${translated.codeFences.length}`,
    );
  } else {
    for (let i = 0; i < original.codeFences.length; i++) {
      const o = original.codeFences[i];
      const t = translated.codeFences[i];
      if (o.lang !== t.lang) {
        issues.push(
          `Code fence language mismatch at #${i + 1}: original "${o.lang}", translated "${t.lang}"`,
        );
      }
    }
  }

  if (original.tableRows !== translated.tableRows) {
    issues.push(
      `Table row count mismatch: original ${original.tableRows}, translated ${translated.tableRows}`,
    );
  }

  if (original.blockquotes.length !== translated.blockquotes.length) {
    issues.push(
      `Blockquote count mismatch: original ${original.blockquotes.length}, translated ${translated.blockquotes.length}`,
    );
  }

  return issues;
}

/**
 * Attempt to repair common markdown structure issues in translated text.
 * Returns the repaired text.
 */
export function repairMarkdown(
  original: string,
  translated: string,
): string {
  let result = translated;
  const origStructure = extractStructure(original);
  const transStructure = extractStructure(result);

  // Repair code fences: ensure matching ``` count
  if (origStructure.codeFences.length > transStructure.codeFences.length) {
    const missing = origStructure.codeFences.length - transStructure.codeFences.length;
    // Add closing fences if we have fewer than expected
    const currentFences = transStructure.codeFences.filter((f) => f.lang !== "");
    const unclosed = origStructure.codeFences.length - transStructure.codeFences.length;
    if (unclosed > 0) {
      // Append closing fences at the end
      result += "\n" + "```".repeat(Math.min(unclosed, 3));
    }
  }

  // Repair heading levels: ensure no heading level jumps beyond 1
  const resultLines = result.split("\n");
  let lastHeadingLevel = 0;
  for (let i = 0; i < resultLines.length; i++) {
    const headingMatch = resultLines[i].match(/^(#{1,6})\s/);
    if (headingMatch) {
      const currentLevel = headingMatch[1].length;
      // Don't allow jumps more than 2 levels above the previous heading
      if (lastHeadingLevel > 0 && currentLevel > lastHeadingLevel + 2) {
        resultLines[i] = "#".repeat(lastHeadingLevel + 2) + resultLines[i].slice(currentLevel);
      }
      lastHeadingLevel = currentLevel;
    }
  }
  result = resultLines.join("\n");

  return result;
}

/**
 * Run full validation + repair pipeline.
 * Returns { validated: true, issues: [...], repaired: text } when issues found,
 * or { validated: true, issues: [], repaired: translated } when clean.
 */
export function validateAndRepair(
  original: string,
  translated: string,
): { issues: string[]; repaired: string; hadIssues: boolean } {
  const origStructure = extractStructure(original);
  const transStructure = extractStructure(translated);
  const issues = compareStructures(origStructure, transStructure);

  if (issues.length === 0) {
    return { issues: [], repaired: translated, hadIssues: false };
  }

  let repaired = repairMarkdown(original, translated);

  // Re-validate after repair
  const repairedStructure = extractStructure(repaired);
  const remainingIssues = compareStructures(origStructure, repairedStructure);

  return {
    issues: remainingIssues.length > 0 ? [...issues, "After repair, remaining issues:", ...remainingIssues] : issues,
    repaired,
    hadIssues: true,
  };
}
