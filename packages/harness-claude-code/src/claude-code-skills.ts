import type { Experimental_Sandbox } from '@ai-sdk/provider-utils';

export type ClaudeCodeSkill = {
  readonly name: string;
  readonly description: string;
  readonly content: string;
};

/**
 * Materialise skill files into `${workdir}/.claude/skills/<name>.md`. The
 * `claude` CLI auto-discovers skills from that directory on startup, so the
 * files have to be in place before the bridge is spawned. Each file uses
 * the YAML-frontmatter shape the CLI expects.
 */
export async function writeSkills({
  sandbox,
  workdir,
  skills,
  abortSignal,
}: {
  sandbox: Experimental_Sandbox;
  workdir: string;
  skills: ReadonlyArray<ClaudeCodeSkill>;
  abortSignal?: AbortSignal;
}): Promise<void> {
  if (skills.length === 0) return;
  await sandbox.runCommand({
    command: `mkdir -p ${workdir}/.claude/skills`,
    abortSignal,
  });
  for (const skill of skills) {
    const path = `${workdir}/.claude/skills/${skill.name}.md`;
    const content = `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n${skill.content}\n`;
    await sandbox.writeTextFile({ path, content, abortSignal });
  }
}
