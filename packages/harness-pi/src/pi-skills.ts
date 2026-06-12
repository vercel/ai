import path from 'node:path';
import type { HarnessV1Skill } from '@ai-sdk/harness';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { renderPiSkillFile, safePiMetadataSegment } from './pi-utils';

/**
 * Materialize Pi skills as files under
 * `$HOME/.agents/skills/<name>/SKILL.md` inside the sandbox.
 */
export async function writePiSkills(args: {
  readonly sandbox: Experimental_SandboxSession;
  readonly sandboxHomeDir: string;
  readonly skills: ReadonlyArray<HarnessV1Skill>;
  readonly abortSignal?: AbortSignal;
}): Promise<void> {
  for (const skill of args.skills) {
    safePiMetadataSegment(skill.name, 'skill');
    for (const file of skill.files ?? []) {
      safePiSkillFilePath({ skillName: skill.name, filePath: file.path });
    }
  }

  for (const skill of args.skills) {
    const name = safePiMetadataSegment(skill.name, 'skill');
    const sandboxSkillDir = path.posix.join(
      args.sandboxHomeDir,
      '.agents',
      'skills',
      name,
    );
    const content = renderPiSkillFile(skill);

    await args.sandbox.writeTextFile({
      path: path.posix.join(sandboxSkillDir, 'SKILL.md'),
      content,
      ...(args.abortSignal ? { abortSignal: args.abortSignal } : {}),
    });

    for (const file of skill.files ?? []) {
      const filePath = safePiSkillFilePath({
        skillName: skill.name,
        filePath: file.path,
      });
      await args.sandbox.writeTextFile({
        path: path.posix.join(sandboxSkillDir, filePath),
        content: file.content,
        ...(args.abortSignal ? { abortSignal: args.abortSignal } : {}),
      });
    }
  }
}

function safePiSkillFilePath({
  skillName,
  filePath,
}: {
  skillName: string;
  filePath: string;
}): string {
  const normalized = path.posix.normalize(filePath);
  if (
    normalized === '.' ||
    normalized.startsWith('../') ||
    path.posix.isAbsolute(normalized)
  ) {
    throw new Error(`Invalid Pi skill file path for ${skillName}: ${filePath}`);
  }
  return normalized;
}
