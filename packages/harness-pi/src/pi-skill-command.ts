import { stripFrontmatter, type Skill } from '@earendil-works/pi-coding-agent';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';

const SKILL_COMMAND_PREFIX = '/skill:';

/*
 * Pi expands a message that starts with `/skill:<name>` by reading the
 * skill's `filePath` with Node's `readFileSync` in the host process, but
 * harness skills live in the sandbox. This expands the command from the
 * sandbox instead, in the same format Pi uses, so the text that reaches Pi no
 * longer starts with `/skill:`. When the skill file cannot be read from the
 * sandbox, a leading space keeps Pi from attempting its host read. Unknown
 * skills are returned unchanged: Pi looks them up in the same skill list and
 * passes them through without reading any file.
 */
export async function expandPiSkillCommand({
  text,
  skills,
  sandbox,
  abortSignal,
}: {
  text: string;
  skills: ReadonlyArray<Pick<Skill, 'name' | 'filePath' | 'baseDir'>>;
  sandbox: Pick<SandboxSession, 'readTextFile'>;
  abortSignal?: AbortSignal;
}): Promise<string> {
  if (!text.startsWith(SKILL_COMMAND_PREFIX)) return text;

  const spaceIndex = text.indexOf(' ');
  const skillName =
    spaceIndex === -1
      ? text.slice(SKILL_COMMAND_PREFIX.length)
      : text.slice(SKILL_COMMAND_PREFIX.length, spaceIndex);
  const args = spaceIndex === -1 ? '' : text.slice(spaceIndex + 1).trim();

  const skill = skills.find(candidate => candidate.name === skillName);
  if (skill == null) return text;

  let content: string | null | undefined;
  try {
    content = await sandbox.readTextFile({
      path: skill.filePath,
      ...(abortSignal ? { abortSignal } : {}),
    });
  } catch (error) {
    if (abortSignal?.aborted) throw error;
    return ` ${text}`;
  }
  if (content == null) return ` ${text}`;

  const body = stripFrontmatter(content).trim();
  const skillBlock = `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
  return args ? `${skillBlock}\n\n${args}` : skillBlock;
}
