import path from 'node:path';
import type { HarnessV1Skill } from '@ai-sdk/harness';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';

export type WriteCursorSkillsResult = {
  readonly homeDir: string;
};

export async function writeCursorSkills({
  sandbox,
  skills,
  abortSignal,
}: {
  sandbox: Experimental_SandboxSession;
  skills: ReadonlyArray<HarnessV1Skill>;
  abortSignal?: AbortSignal;
}): Promise<WriteCursorSkillsResult> {
  for (const skill of skills) {
    safeCursorSkillName(skill.name);
    for (const file of skill.files ?? []) {
      safeCursorSkillFilePath({
        skillName: skill.name,
        filePath: file.path,
      });
    }
  }

  const homeDir = await resolveSandboxHomeDir({ sandbox, abortSignal });
  const rootDir = path.posix.join(homeDir, '.cursor', 'skills');
  await sandbox.run({
    command: `mkdir -p ${shellQuote(rootDir)}`,
    abortSignal,
  });

  for (const skill of skills) {
    const name = safeCursorSkillName(skill.name);
    const skillDir = path.posix.join(rootDir, name);
    const content = `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n${skill.content}`;

    await sandbox.writeTextFile({
      path: path.posix.join(skillDir, 'SKILL.md'),
      content,
      abortSignal,
    });

    for (const file of skill.files ?? []) {
      const filePath = safeCursorSkillFilePath({
        skillName: skill.name,
        filePath: file.path,
      });
      await sandbox.writeTextFile({
        path: path.posix.join(skillDir, filePath),
        content: file.content,
        abortSignal,
      });
    }
  }

  return { homeDir };
}

async function resolveSandboxHomeDir({
  sandbox,
  abortSignal,
}: {
  sandbox: Experimental_SandboxSession;
  abortSignal?: AbortSignal;
}): Promise<string> {
  const result = await sandbox.run({
    command: 'printf "%s" "$HOME"',
    abortSignal,
  });
  const homeDir = result.stdout.trim();
  if (result.exitCode !== 0 || !homeDir || !path.posix.isAbsolute(homeDir)) {
    throw new Error(
      `Unable to resolve sandbox HOME directory: ${result.stderr || result.stdout}`,
    );
  }
  return homeDir;
}

function safeCursorSkillName(name: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name === '.' || name === '..') {
    throw new Error(`Invalid Cursor skill name: ${name}`);
  }
  return name;
}

function safeCursorSkillFilePath({
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
    throw new Error(
      `Invalid Cursor skill file path for ${skillName}: ${filePath}`,
    );
  }
  return normalized;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
