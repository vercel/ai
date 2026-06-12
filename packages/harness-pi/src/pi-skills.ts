import path from 'node:path';
import type { HarnessV1Skill } from '@ai-sdk/harness';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { renderPiSkillFile, safePiMetadataSegment } from './pi-utils';

/**
 * Materialize Pi skills as files under `${sessionWorkDir}/.pi/skills/<name>/SKILL.md`
 * inside the sandbox. Pi's `DefaultResourceLoader` auto-discovers them when
 * the resource loader is reloaded.
 */
export async function writePiSkills(args: {
  readonly sandbox: Experimental_SandboxSession;
  readonly sessionWorkDir: string;
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
    const remotePath = path.posix.join(
      args.sessionWorkDir,
      '.pi',
      'skills',
      name,
      'SKILL.md',
    );
    await args.sandbox.writeTextFile({
      path: remotePath,
      content: renderPiSkillFile(skill),
      ...(args.abortSignal ? { abortSignal: args.abortSignal } : {}),
    });
    for (const file of skill.files ?? []) {
      const filePath = safePiSkillFilePath({
        skillName: skill.name,
        filePath: file.path,
      });
      await args.sandbox.writeTextFile({
        path: path.posix.join(
          args.sessionWorkDir,
          '.pi',
          'skills',
          name,
          filePath,
        ),
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
