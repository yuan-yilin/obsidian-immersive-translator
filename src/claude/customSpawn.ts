import { cliPathRequiresNode, findNodeExecutable } from "../utils/env";

export function buildClaudeCommand(cliPath: string, enhancedPath: string, systemPrompt: string, model: string): { command: string; args: string[] } {
  let command = cliPath;
  const args: string[] = [];

  if (cliPathRequiresNode(cliPath)) {
    command = findNodeExecutable(enhancedPath) ?? "node";
    args.push(cliPath);
  }

  args.push(
    "--print",
    "--input-format",
    "text",
    "--output-format",
    "text",
    "--no-session-persistence",
    "--system-prompt",
    systemPrompt,
    "--tools",
    "",
  );

  const trimmedModel = model.trim();
  if (trimmedModel) {
    args.push("--model", trimmedModel);
  }

  return { command, args };
}
