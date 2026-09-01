import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  safeParseJSON,
  type Experimental_SandboxSession,
} from '@ai-sdk/provider-utils';
import type { HarnessV1Skill } from '../v1';
import { shellQuote } from './shell-quote';

const SKILLS_MANIFEST_FILENAME = '.ai-sdk-harness-skills.json';
const SKILLS_MANIFEST_VERSION = 1;
const SAFE_MANIFEST_SKILL_NAME = /^[A-Za-z0-9._-]+$/;

export type SkillFilePathMode = 'relative' | 'strip-leading-slashes';

export type WriteSkillsOptions = {
  sandbox: Experimental_SandboxSession;
  rootDir: string;
  skills: ReadonlyArray<HarnessV1Skill>;
  abortSignal?: AbortSignal;
  skillNamePattern?: RegExp;
  invalidSkillNameMessage?: (input: { name: string }) => string;
  filePathMode?: SkillFilePathMode;
  invalidSkillFilePathMessage?: (input: {
    skillName: string;
    filePath: string;
  }) => string;
  trailingNewline?: boolean;
};

export type WriteSkillsResult = {
  changed: boolean;
  written: string[];
  removed: string[];
  unchanged: string[];
};

type ProjectedSkill = {
  readonly name: string;
  readonly hash: string;
  readonly files: ReadonlyArray<{
    readonly path: string;
    readonly content: string;
  }>;
};

type SkillsManifestEntry = {
  readonly name: string;
  readonly hash: string;
};

type SkillsManifest = {
  readonly version: typeof SKILLS_MANIFEST_VERSION;
  readonly state: 'complete' | 'pending';
  readonly skills: ReadonlyArray<SkillsManifestEntry>;
};

export async function writeSkills({
  sandbox,
  rootDir,
  skills,
  abortSignal,
  skillNamePattern = /^[A-Za-z0-9._-]+$/,
  invalidSkillNameMessage = ({ name }) => `Invalid skill name: ${name}`,
  filePathMode = 'relative',
  invalidSkillFilePathMessage = ({ skillName, filePath }) =>
    `Invalid skill file path for ${skillName}: ${filePath}`,
  trailingNewline = false,
}: WriteSkillsOptions): Promise<WriteSkillsResult> {
  const projectedSkills = skills
    .map(skill =>
      projectSkill({
        skill,
        skillNamePattern,
        invalidSkillNameMessage,
        filePathMode,
        invalidSkillFilePathMessage,
        trailingNewline,
      }),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  assertUniqueSkillNames(projectedSkills);

  const manifestPath = path.posix.join(rootDir, SKILLS_MANIFEST_FILENAME);
  const existingManifest = await readSkillsManifest({
    sandbox,
    manifestPath,
    abortSignal,
  });
  const nextEntries = projectedSkills.map(({ name, hash }) => ({ name, hash }));
  const nextByName = new Map(nextEntries.map(entry => [entry.name, entry]));

  /*
   * Delete pending-manifest directories before rewriting the requested skills;
   * any listed directory may contain only part of its intended files.
   */
  if (existingManifest?.state === 'pending') {
    await ensureSkillsDirectory({ sandbox, rootDir, abortSignal });
    const recoveryNames = existingManifest.skills.map(skill => skill.name);
    await removeSkillDirectories({
      sandbox,
      rootDir,
      skillNames: recoveryNames,
      abortSignal,
    });
    const removed = recoveryNames
      .filter(name => !nextByName.has(name))
      .sort((a, b) => a.localeCompare(b));
    await writeProjectedSkills({
      sandbox,
      rootDir,
      skills: projectedSkills,
      abortSignal,
    });
    await writeSkillsManifest({
      sandbox,
      manifestPath,
      manifest: {
        version: SKILLS_MANIFEST_VERSION,
        state: 'complete',
        skills: nextEntries,
      },
      abortSignal,
    });
    return {
      changed: recoveryNames.length > 0 || projectedSkills.length > 0,
      written: projectedSkills.map(skill => skill.name),
      removed,
      unchanged: [],
    };
  }

  const previousEntries = existingManifest?.skills ?? [];
  const previousByName = new Map(
    previousEntries.map(entry => [entry.name, entry]),
  );
  const removed = previousEntries
    .filter(entry => !nextByName.has(entry.name))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b));
  const written = projectedSkills
    .filter(skill => previousByName.get(skill.name)?.hash !== skill.hash)
    .map(skill => skill.name)
    .sort((a, b) => a.localeCompare(b));
  const unchanged = projectedSkills
    .filter(skill => previousByName.get(skill.name)?.hash === skill.hash)
    .map(skill => skill.name)
    .sort((a, b) => a.localeCompare(b));
  const changed = removed.length > 0 || written.length > 0;

  if (!changed && existingManifest != null) {
    return { changed: false, written, removed, unchanged };
  }

  const previouslyOwned = new Set(previousEntries.map(entry => entry.name));
  for (const skillName of written) {
    if (previouslyOwned.has(skillName)) continue;
    await assertSkillDirectoryAvailable({
      sandbox,
      rootDir,
      skillName,
      abortSignal,
    });
  }

  await ensureSkillsDirectory({ sandbox, rootDir, abortSignal });

  const pendingNames = Array.from(
    new Set([
      ...previousEntries.map(entry => entry.name),
      ...nextEntries.map(entry => entry.name),
    ]),
  ).sort((a, b) => a.localeCompare(b));
  await writeSkillsManifest({
    sandbox,
    manifestPath,
    manifest: {
      version: SKILLS_MANIFEST_VERSION,
      state: 'pending',
      skills: pendingNames.map(name => ({
        name,
        hash: nextByName.get(name)?.hash ?? previousByName.get(name)!.hash,
      })),
    },
    abortSignal,
  });

  await removeSkillDirectories({
    sandbox,
    rootDir,
    skillNames: [
      ...removed,
      ...written.filter(name => previouslyOwned.has(name)),
    ],
    abortSignal,
  });
  const writtenSet = new Set(written);
  await writeProjectedSkills({
    sandbox,
    rootDir,
    skills: projectedSkills.filter(skill => writtenSet.has(skill.name)),
    abortSignal,
  });
  await writeSkillsManifest({
    sandbox,
    manifestPath,
    manifest: {
      version: SKILLS_MANIFEST_VERSION,
      state: 'complete',
      skills: nextEntries,
    },
    abortSignal,
  });

  return { changed, written, removed, unchanged };
}

async function ensureSkillsDirectory({
  sandbox,
  rootDir,
  abortSignal,
}: {
  sandbox: Experimental_SandboxSession;
  rootDir: string;
  abortSignal?: AbortSignal;
}): Promise<void> {
  await runSandboxCommand({
    sandbox,
    command: `mkdir -p ${shellQuote(rootDir)}`,
    abortSignal,
    errorMessage: `Failed to create skills directory: ${rootDir}`,
  });
}

function projectSkill({
  skill,
  skillNamePattern,
  invalidSkillNameMessage,
  filePathMode,
  invalidSkillFilePathMessage,
  trailingNewline,
}: {
  skill: HarnessV1Skill;
  skillNamePattern: RegExp;
  invalidSkillNameMessage: (input: { name: string }) => string;
  filePathMode: SkillFilePathMode;
  invalidSkillFilePathMessage: (input: {
    skillName: string;
    filePath: string;
  }) => string;
  trailingNewline: boolean;
}): ProjectedSkill {
  const name = validateSkillName({
    name: skill.name,
    pattern: skillNamePattern,
    message: invalidSkillNameMessage,
  });
  const files = new Map<string, string>();
  files.set('SKILL.md', renderSkillFile({ skill, trailingNewline }));
  for (const file of skill.files ?? []) {
    files.set(
      normalizeSkillFilePath({
        skillName: skill.name,
        filePath: file.path,
        mode: filePathMode,
        message: invalidSkillFilePathMessage,
      }),
      file.content,
    );
  }
  const projectedFiles = Array.from(files, ([filePath, content]) => ({
    path: filePath,
    content,
  })).sort((a, b) => a.path.localeCompare(b.path));
  const hash = createHash('sha256');
  for (const file of projectedFiles) {
    hash.update(String(Buffer.byteLength(file.path)));
    hash.update(':');
    hash.update(file.path);
    hash.update(String(Buffer.byteLength(file.content)));
    hash.update(':');
    hash.update(file.content);
  }
  return { name, hash: hash.digest('hex'), files: projectedFiles };
}

async function readSkillsManifest({
  sandbox,
  manifestPath,
  abortSignal,
}: {
  sandbox: Experimental_SandboxSession;
  manifestPath: string;
  abortSignal?: AbortSignal;
}): Promise<SkillsManifest | undefined> {
  const content = await sandbox.readTextFile({
    path: manifestPath,
    abortSignal,
  });
  if (content == null) return undefined;
  const parsed = await safeParseJSON({ text: content });
  if (!parsed.success || !isSkillsManifest(parsed.value)) {
    throw new Error(`Invalid AI SDK harness skills manifest: ${manifestPath}`);
  }
  return parsed.value;
}

function isSkillsManifest(value: unknown): value is SkillsManifest {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const manifest = value as Record<string, unknown>;
  if (
    manifest.version !== SKILLS_MANIFEST_VERSION ||
    (manifest.state !== 'complete' && manifest.state !== 'pending') ||
    !Array.isArray(manifest.skills)
  ) {
    return false;
  }
  const names = new Set<string>();
  for (const entry of manifest.skills) {
    if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
      return false;
    }
    const skill = entry as Record<string, unknown>;
    if (
      typeof skill.name !== 'string' ||
      !isSafeManifestSkillName(skill.name) ||
      typeof skill.hash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(skill.hash) ||
      names.has(skill.name)
    ) {
      return false;
    }
    names.add(skill.name);
  }
  return true;
}

async function writeSkillsManifest({
  sandbox,
  manifestPath,
  manifest,
  abortSignal,
}: {
  sandbox: Experimental_SandboxSession;
  manifestPath: string;
  manifest: SkillsManifest;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const temporaryPath = `${manifestPath}.tmp`;
  await sandbox.writeTextFile({
    path: temporaryPath,
    content: `${JSON.stringify(manifest, null, 2)}\n`,
    abortSignal,
  });
  await runSandboxCommand({
    sandbox,
    command: `mv -f ${shellQuote(temporaryPath)} ${shellQuote(manifestPath)}`,
    abortSignal,
    errorMessage: `Failed to update skills manifest: ${manifestPath}`,
  });
}

async function assertSkillDirectoryAvailable({
  sandbox,
  rootDir,
  skillName,
  abortSignal,
}: {
  sandbox: Experimental_SandboxSession;
  rootDir: string;
  skillName: string;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const skillDir = path.posix.join(rootDir, skillName);
  const result = await sandbox.run({
    command: `test ! -e ${shellQuote(skillDir)}`,
    abortSignal,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `Cannot write harness skill '${skillName}': ${skillDir} already exists and is not owned by the AI SDK harness.`,
    );
  }
}

async function removeSkillDirectories({
  sandbox,
  rootDir,
  skillNames,
  abortSignal,
}: {
  sandbox: Experimental_SandboxSession;
  rootDir: string;
  skillNames: ReadonlyArray<string>;
  abortSignal?: AbortSignal;
}): Promise<void> {
  if (skillNames.length === 0) return;
  const directories = Array.from(new Set(skillNames))
    .sort((a, b) => a.localeCompare(b))
    .map(name => shellQuote(path.posix.join(rootDir, name)))
    .join(' ');
  await runSandboxCommand({
    sandbox,
    command: `rm -rf -- ${directories}`,
    abortSignal,
    errorMessage: `Failed to replace harness skills in: ${rootDir}`,
  });
}

async function writeProjectedSkills({
  sandbox,
  rootDir,
  skills,
  abortSignal,
}: {
  sandbox: Experimental_SandboxSession;
  rootDir: string;
  skills: ReadonlyArray<ProjectedSkill>;
  abortSignal?: AbortSignal;
}): Promise<void> {
  for (const skill of skills) {
    const skillDir = path.posix.join(rootDir, skill.name);
    for (const file of skill.files) {
      await sandbox.writeTextFile({
        path: path.posix.join(skillDir, file.path),
        content: file.content,
        abortSignal,
      });
    }
  }
}

async function runSandboxCommand({
  sandbox,
  command,
  abortSignal,
  errorMessage,
}: {
  sandbox: Experimental_SandboxSession;
  command: string;
  abortSignal?: AbortSignal;
  errorMessage: string;
}): Promise<void> {
  const result = await sandbox.run({ command, abortSignal });
  if (result.exitCode !== 0) {
    throw new Error(
      `${errorMessage} (exit ${result.exitCode})${result.stderr ? `: ${result.stderr}` : ''}`,
    );
  }
}

function assertUniqueSkillNames(skills: ReadonlyArray<ProjectedSkill>): void {
  for (let index = 1; index < skills.length; index++) {
    if (skills[index - 1]!.name === skills[index]!.name) {
      throw new Error(`Duplicate skill name: ${skills[index]!.name}`);
    }
  }
}

function isSafeManifestSkillName(name: string): boolean {
  SAFE_MANIFEST_SKILL_NAME.lastIndex = 0;
  const matches = SAFE_MANIFEST_SKILL_NAME.test(name);
  SAFE_MANIFEST_SKILL_NAME.lastIndex = 0;
  return matches && name !== '.' && name !== '..' && !name.includes('/');
}

function validateSkillName({
  name,
  pattern,
  message,
}: {
  name: string;
  pattern: RegExp;
  message?: (input: { name: string }) => string;
}): string {
  pattern.lastIndex = 0;
  const matches = pattern.test(name);
  pattern.lastIndex = 0;
  if (!matches || name === '.' || name === '..') {
    throw new Error(message?.({ name }) ?? `Invalid skill name: ${name}`);
  }
  return name;
}

function normalizeSkillFilePath({
  skillName,
  filePath,
  mode,
  message,
}: {
  skillName?: string;
  filePath: string;
  mode: SkillFilePathMode;
  message?: (input: { skillName: string; filePath: string }) => string;
}): string {
  const normalized =
    mode === 'strip-leading-slashes'
      ? filePath.replace(/^\/+/, '')
      : path.posix.normalize(filePath);
  const invalid =
    normalized === '' ||
    (mode === 'relative' && normalized === '.') ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    normalized.endsWith('/..') ||
    (mode === 'relative' && path.posix.isAbsolute(normalized));

  if (invalid) {
    throw new Error(
      message?.({ skillName: skillName ?? '', filePath }) ??
        `Invalid skill file path for ${skillName}: ${filePath}`,
    );
  }
  return normalized;
}

function renderSkillFile({
  skill,
  trailingNewline,
}: {
  skill: HarnessV1Skill;
  trailingNewline: boolean;
}): string {
  const content = `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n${skill.content}`;
  return trailingNewline ? `${content}\n` : content;
}
