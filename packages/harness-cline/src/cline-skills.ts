import path from 'node:path';
import type { HarnessV1Skill } from '@ai-sdk/harness';
import { resolveSandboxHomeDir, writeSkills } from '@ai-sdk/harness/utils';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';

/**
 * Materialize harness-provided skills into the sandbox HOME
 * (`~/.agents/skills/<name>/SKILL.md` plus any auxiliary files) and return
 * the root directory they were written to. The Cline runtime has no native
 * skill loader, so the session surfaces them to the model through a system
 * prompt section (see `renderSkillsPromptSection`) that points at these files.
 */
export async function writeClineSkills({
  sandbox,
  skills,
  abortSignal,
}: {
  sandbox: Experimental_SandboxSession;
  skills: ReadonlyArray<HarnessV1Skill>;
  abortSignal?: AbortSignal;
}): Promise<string | undefined> {
  if (skills.length === 0) return undefined;
  const sandboxHomeDir = await resolveSandboxHomeDir({
    sandbox,
    ...(abortSignal ? { abortSignal } : {}),
  });
  const skillRootDir = path.posix.join(sandboxHomeDir, '.agents', 'skills');
  await writeSkills({
    sandbox,
    rootDir: skillRootDir,
    skills,
    ...(abortSignal ? { abortSignal } : {}),
  });
  return skillRootDir;
}

/**
 * Render the system-prompt section that advertises available skills. Only the
 * name + description sit in context; the model loads the full skill via the
 * `read` tool when the task calls for it (progressive disclosure).
 */
export function renderSkillsPromptSection(
  skills: ReadonlyArray<HarnessV1Skill>,
  skillRootDir: string,
): string {
  const entries = skills
    .map(
      skill =>
        `- ${skill.name}: ${skill.description}\n  SKILL.md: ${path.posix.join(
          skillRootDir,
          skill.name,
          'SKILL.md',
        )}`,
    )
    .join('\n');
  return (
    '## Skills\n\n' +
    'The following skills are available. When a task matches a skill, read its SKILL.md with the `read` tool and follow its instructions.\n\n' +
    entries
  );
}
