export function splitTextIntoChunks(text: string, maxChunkSize: number): string[] {
  const size = Math.max(500, maxChunkSize);
  if (text.length <= size) {
    return [text];
  }

  const blocks = splitMarkdownBlocks(text);
  const chunks: string[] = [];
  let current = "";

  for (const block of blocks) {
    if (current && current.length + block.length > size) {
      chunks.push(current);
      current = block;
      continue;
    }

    current += block;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.length > 0 ? chunks : [text];
}

function splitMarkdownBlocks(text: string): string[] {
  const lines = text.split(/(\n)/);
  const logicalLines: string[] = [];

  for (let i = 0; i < lines.length; i += 2) {
    logicalLines.push(lines[i] + (lines[i + 1] ?? ""));
  }

  const blocks: string[] = [];
  let current = "";
  let inFence = false;
  let inFrontmatter = false;
  let canStartFrontmatter = true;

  for (const line of logicalLines) {
    const trimmed = line.trim();

    if (canStartFrontmatter && trimmed === "---") {
      inFrontmatter = true;
      canStartFrontmatter = false;
    } else if (inFrontmatter && (trimmed === "---" || trimmed === "...")) {
      current += line;
      blocks.push(current);
      current = "";
      inFrontmatter = false;
      continue;
    } else if (trimmed.length > 0) {
      canStartFrontmatter = false;
    }

    if (!inFrontmatter && /^```|^~~~/.test(trimmed)) {
      inFence = !inFence;
    }

    current += line;

    if (!inFence && !inFrontmatter && trimmed === "") {
      blocks.push(current);
      current = "";
    }
  }

  if (current) {
    blocks.push(current);
  }

  return blocks;
}
