export type CodexSkill = {
  readonly name: string;
  readonly description: string;
  readonly content: string;
};

/**
 * Render a skills block to be prepended to the user prompt.
 *
 * Codex CLI does not auto-discover a skills directory the way the `claude`
 * CLI does, so skills are surfaced by injecting them inline. The model sees
 * the full content of every supplied skill on every turn — there is no
 * runtime selection. For purely context-sensitive skill activation, fewer
 * larger skills work better than many small ones.
 */
export function renderCodexSkillsBlock(
  skills: ReadonlyArray<CodexSkill> | undefined,
): string | undefined {
  if (!skills || skills.length === 0) return undefined;
  const lines: string[] = ['## Available skills'];
  for (const skill of skills) {
    lines.push('', `### ${skill.name}`, skill.description, '', skill.content);
  }
  return lines.join('\n');
}
