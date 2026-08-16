import { createHash } from 'node:crypto';
import path from 'node:path';
import type { HarnessV1Skill } from '@ai-sdk/harness';
import { writeSkills } from '@ai-sdk/harness/utils';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import type { ACPSkillCatalogEntry } from './acp-v1-prompt';

const ACP_SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function createACPSkillsFingerprint({
  skills,
}: {
  skills: ReadonlyArray<HarnessV1Skill>;
}): string {
  const canonicalSkills = skills
    .map(skill => ({
      name: skill.name,
      description: skill.description,
      content: skill.content,
      files: [...(skill.files ?? [])]
        .map(file => ({
          path: path.posix.normalize(file.path),
          content: file.content,
        }))
        .sort((left, right) =>
          compareCanonicalStrings({ left: left.path, right: right.path }),
        ),
    }))
    .sort((left, right) =>
      compareCanonicalStrings({ left: left.name, right: right.name }),
    );
  return createHash('sha256')
    .update(JSON.stringify(canonicalSkills))
    .digest('hex');
}

export function resolveACPPrivateSessionDirectory({
  sandboxHomeDir,
  sessionWorkDir,
  harnessId,
  sessionId,
}: {
  sandboxHomeDir: string;
  sessionWorkDir: string;
  harnessId: string;
  sessionId: string;
}): string {
  const sessionKey = createHash('sha256').update(sessionId).digest('hex');
  const rootDir = path.posix.join(
    sandboxHomeDir,
    '.ai-sdk',
    'harness-acp',
    harnessId,
    sessionKey,
  );
  assertOutsideSessionWorkDir({ rootDir, sessionWorkDir });
  return rootDir;
}

export async function materializeACPSkills({
  sandbox,
  sandboxHomeDir,
  sessionWorkDir,
  harnessId,
  sessionId,
  skills,
  shouldMaterialize,
  abortSignal,
}: {
  sandbox: Experimental_SandboxSession;
  sandboxHomeDir: string;
  sessionWorkDir: string;
  harnessId: string;
  sessionId: string;
  skills: ReadonlyArray<HarnessV1Skill>;
  shouldMaterialize: boolean;
  abortSignal?: AbortSignal;
}): Promise<{
  readonly catalog: ReadonlyArray<ACPSkillCatalogEntry>;
  readonly rootDir: string;
}> {
  validateACPSkills({ skills });

  const rootDir = path.posix.join(
    resolveACPPrivateSessionDirectory({
      sandboxHomeDir,
      sessionWorkDir,
      harnessId,
      sessionId,
    }),
    'skills',
  );

  if (shouldMaterialize) {
    await writeSkills({
      sandbox,
      rootDir,
      skills,
      abortSignal,
      skillNamePattern: ACP_SKILL_NAME_PATTERN,
      invalidSkillNameMessage: ({ name }) =>
        `Invalid ACP skill name ${JSON.stringify(name)}: expected a kebab-case slug.`,
      invalidSkillFilePathMessage: ({ skillName, filePath }) =>
        `Invalid ACP skill file path ${JSON.stringify(filePath)} for skill ${JSON.stringify(
          skillName,
        )}: expected a relative POSIX path without traversal.`,
    });
  }

  return {
    rootDir,
    catalog: skills.map(skill => ({
      name: skill.name,
      description: skill.description,
      path: path.posix.join(rootDir, skill.name, 'SKILL.md'),
    })),
  };
}

function validateACPSkills({
  skills,
}: {
  skills: ReadonlyArray<HarnessV1Skill>;
}): void {
  const skillNames = new Set<string>();
  for (const skill of skills) {
    if (
      !ACP_SKILL_NAME_PATTERN.test(skill.name) ||
      skill.name === '.' ||
      skill.name === '..'
    ) {
      throw new Error(
        `Invalid ACP skill name ${JSON.stringify(skill.name)}: expected a kebab-case slug.`,
      );
    }
    if (skillNames.has(skill.name)) {
      throw new Error(
        `Duplicate ACP skill name ${JSON.stringify(skill.name)}.`,
      );
    }
    skillNames.add(skill.name);

    const filePaths = new Set<string>();
    for (const file of skill.files ?? []) {
      const normalizedPath = validateACPAttachedFilePath({
        skillName: skill.name,
        filePath: file.path,
      });
      if (normalizedPath === 'SKILL.md') {
        throw new Error(
          `Invalid ACP skill file path ${JSON.stringify(file.path)} for skill ${JSON.stringify(
            skill.name,
          )}: SKILL.md is reserved for the skill definition.`,
        );
      }
      if (filePaths.has(normalizedPath)) {
        throw new Error(
          `Duplicate ACP skill file path ${JSON.stringify(file.path)} for skill ${JSON.stringify(
            skill.name,
          )}.`,
        );
      }
      filePaths.add(normalizedPath);
    }
  }
}

function validateACPAttachedFilePath({
  skillName,
  filePath,
}: {
  skillName: string;
  filePath: string;
}): string {
  const containsTraversal = filePath
    .split(/[\\/]/)
    .some(segment => segment === '..');
  const normalizedPath = path.posix.normalize(filePath);
  const invalid =
    filePath.length === 0 ||
    filePath.endsWith('/') ||
    filePath.includes('\\') ||
    path.posix.isAbsolute(filePath) ||
    path.win32.isAbsolute(filePath) ||
    containsTraversal ||
    normalizedPath === '.' ||
    normalizedPath.startsWith('../') ||
    normalizedPath.includes('/../') ||
    normalizedPath.endsWith('/..');
  if (invalid) {
    throw new Error(
      `Invalid ACP skill file path ${JSON.stringify(filePath)} for skill ${JSON.stringify(
        skillName,
      )}: expected a relative POSIX path without traversal.`,
    );
  }
  return normalizedPath;
}

function assertOutsideSessionWorkDir({
  rootDir,
  sessionWorkDir,
}: {
  rootDir: string;
  sessionWorkDir: string;
}): void {
  const relative = path.posix.relative(sessionWorkDir, rootDir);
  const isInside =
    relative === '' ||
    (!relative.startsWith('../') && !path.posix.isAbsolute(relative));
  if (isInside) {
    throw new Error(
      `ACP skill directory ${JSON.stringify(rootDir)} must be outside sessionWorkDir ${JSON.stringify(
        sessionWorkDir,
      )}.`,
    );
  }
}

function compareCanonicalStrings({
  left,
  right,
}: {
  left: string;
  right: string;
}): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
