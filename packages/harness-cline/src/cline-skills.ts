import path from 'node:path';
import type { HarnessV1Skill } from '@ai-sdk/harness';
import type { AgentTool } from '@cline/agents';
import { createDefaultTools, type ToolExecutors } from '@cline/core';

const CLINE_SKILL_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

type ProjectedClineSkill = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly content: string;
  readonly files: ReadonlyArray<{
    readonly path: string;
    readonly content: string;
  }>;
};

export type ClineSkillsRuntime = {
  readonly signature: string;
  readonly tool?: AgentTool;
};

/**
 * Build Cline's native skills tool around an immutable in-host projection of
 * the harness skills. The low-level Agent does not discover skills itself, so
 * the adapter provides the same tool contract that Cline's core orchestration
 * layer uses without involving the sandbox filesystem.
 */
export function createClineSkillsRuntime({
  skills,
}: {
  skills: ReadonlyArray<HarnessV1Skill>;
}): ClineSkillsRuntime {
  const projectedSkills = projectClineSkills({ skills });
  const signature = JSON.stringify(projectedSkills);
  if (projectedSkills.length === 0) {
    return { signature };
  }

  const executor: NonNullable<ToolExecutors['skills']> = async (
    ...executorArguments
  ) => {
    const [requestedSkill, args] = executorArguments;
    const skill = projectedSkills.find(
      candidate => candidate.id === normalizeSkillToken(requestedSkill),
    );
    if (skill == null) {
      const availableSkills = projectedSkills.map(skill => skill.name);
      return availableSkills.length > 0
        ? `Skill "${requestedSkill}" not found. Available skills: ${availableSkills.join(', ')}`
        : 'No skills are currently available.';
    }
    return renderSkillInstructions({ skill, args });
  };
  executor.configuredSkills = projectedSkills.map(skill => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    disabled: false,
  }));

  const tool = createDefaultTools({
    executors: { skills: executor },
    enableReadFiles: false,
    enableSearch: false,
    enableBash: false,
    enableWebFetch: false,
    enableApplyPatch: false,
    enableEditor: false,
    enableSkills: true,
    enableAskQuestion: false,
    enableSubmitAndExit: false,
  }).find(tool => tool.name === 'skills');
  if (tool == null) {
    throw new Error('Cline did not create its native skills tool.');
  }

  return { signature, tool };
}

function projectClineSkills({
  skills,
}: {
  skills: ReadonlyArray<HarnessV1Skill>;
}): ReadonlyArray<ProjectedClineSkill> {
  const names = new Set<string>();
  const ids = new Set<string>();
  return skills
    .map(skill => {
      if (
        !CLINE_SKILL_NAME_PATTERN.test(skill.name) ||
        skill.name === '.' ||
        skill.name === '..'
      ) {
        throw new Error(`Invalid Cline skill name: ${skill.name}`);
      }
      if (names.has(skill.name)) {
        throw new Error(`Duplicate Cline skill name: ${skill.name}`);
      }
      names.add(skill.name);

      const id = normalizeSkillToken(skill.name);
      if (ids.has(id)) {
        throw new Error(`Duplicate Cline skill identifier: ${id}`);
      }
      ids.add(id);

      return {
        id,
        name: skill.name,
        description: skill.description,
        content: skill.content,
        files: (skill.files ?? [])
          .map(file => ({
            path: normalizeSkillFilePath({
              skillName: skill.name,
              filePath: file.path,
            }),
            content: file.content,
          }))
          .sort(
            (left, right) =>
              left.path.localeCompare(right.path) ||
              left.content.localeCompare(right.content),
          ),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeSkillToken(skill: string): string {
  return skill.trim().replace(/^\/+/, '').toLowerCase();
}

function normalizeSkillFilePath({
  skillName,
  filePath,
}: {
  skillName: string;
  filePath: string;
}): string {
  const normalized = path.posix.normalize(filePath);
  if (
    normalized === '' ||
    normalized === '.' ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    normalized.endsWith('/..') ||
    path.posix.isAbsolute(normalized)
  ) {
    throw new Error(
      `Invalid Cline skill file path for ${skillName}: ${filePath}`,
    );
  }
  return normalized;
}

function renderSkillInstructions({
  skill,
  args,
}: {
  skill: ProjectedClineSkill;
  args: string | undefined;
}): string {
  const trimmedArgs = args?.trim();
  const argsTag = trimmedArgs
    ? `\n<command-args>${trimmedArgs}</command-args>`
    : '';
  const description = skill.description.trim()
    ? `Description: ${skill.description.trim()}\n\n`
    : '';
  const files =
    skill.files.length === 0
      ? ''
      : `\n\n<skill-files>\n${skill.files
          .map(
            file =>
              `<skill-file path=${JSON.stringify(file.path)}>\n${file.content}\n</skill-file>`,
          )
          .join('\n')}\n</skill-files>`;

  return `<command-name>${skill.name}</command-name>${argsTag}\n<command-instructions>\n${description}${skill.content}${files}\n</command-instructions>`;
}
