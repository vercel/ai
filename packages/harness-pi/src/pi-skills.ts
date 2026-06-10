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
  }
}
