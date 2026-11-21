import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDeepAgentsRepositoryResourceMiddlewares } from './repository-resources';

describe('Deep Agents repository resources', () => {
  let tempDir: string;
  let workDir: string;
  let homeDir: string;
  let outsideDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(
      path.join(tmpdir(), 'harness-deepagents-resources-'),
    );
    workDir = path.join(tempDir, 'work');
    homeDir = path.join(tempDir, 'home');
    outsideDir = path.join(tempDir, 'outside');
    await Promise.all(
      [workDir, homeDir, outsideDir].map(directory =>
        mkdir(directory, { recursive: true }),
      ),
    );
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function writeSkill({
    root,
    name,
    description,
    body = 'Skill body',
  }: {
    root: string;
    name: string;
    description: string;
    body?: string;
  }): Promise<void> {
    const skillDir = path.join(root, name);
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, 'SKILL.md'),
      `---\nname: ${name}\ndescription: ${description}\n---\n${body}`,
    );
  }

  function createMiddlewares() {
    return createDeepAgentsRepositoryResourceMiddlewares({
      workDir,
      homeDir,
      skillsPaths: [
        path.join(workDir, '.agents', 'skills'),
        path.join(homeDir, '.agents', 'skills'),
      ],
    });
  }

  async function loadMemory(middlewares: ReturnType<typeof createMiddlewares>) {
    const hook = middlewares.memory.beforeAgent;
    const result = await (typeof hook === 'function'
      ? hook({} as never, {} as never)
      : hook?.hook({} as never, {} as never));
    return (result as { memoryContents?: Record<string, string> } | undefined)
      ?.memoryContents;
  }

  async function loadSkills(middlewares: ReturnType<typeof createMiddlewares>) {
    const hook = middlewares.skills?.beforeModel;
    const result = await (typeof hook === 'function'
      ? hook(
          {
            skillsMetadata: null,
          } as never,
          {} as never,
        )
      : hook?.hook(
          {
            skillsMetadata: null,
          } as never,
          {} as never,
        ));
    return (
      result as
        | {
            skillsMetadata?: Array<{
              name: string;
              description: string;
              path: string;
            }>;
          }
        | undefined
    )?.skillsMetadata;
  }

  it('loads regular AGENTS.md and project/home skills', async () => {
    const agentsPath = path.join(workDir, 'AGENTS.md');
    const projectSkillsRoot = path.join(workDir, '.agents', 'skills');
    const homeSkillsRoot = path.join(homeDir, '.agents', 'skills');
    await writeFile(agentsPath, 'Always respond in French.');
    await writeSkill({
      root: projectSkillsRoot,
      name: 'project-skill',
      description: 'Project skill description.',
    });
    await writeSkill({
      root: homeSkillsRoot,
      name: 'harness-skill',
      description: 'Harness skill description.',
    });

    const middlewares = createMiddlewares();

    expect(await loadMemory(middlewares)).toEqual({
      [agentsPath]: 'Always respond in French.',
    });
    expect((await loadSkills(middlewares))?.map(skill => skill.name)).toEqual([
      'project-skill',
      'harness-skill',
    ]);
  });

  it('does not load AGENTS.md through a symlink outside the workDir', async () => {
    const externalAgentsPath = path.join(outsideDir, 'AGENTS.md');
    await writeFile(externalAgentsPath, 'CONTROLLED_SECRET_MARKER');
    await symlink(externalAgentsPath, path.join(workDir, 'AGENTS.md'));

    const memoryContents = await loadMemory(createMiddlewares());

    expect(memoryContents).toEqual({});
    expect(JSON.stringify(memoryContents)).not.toContain(
      'CONTROLLED_SECRET_MARKER',
    );
  });

  it.each([
    {
      description: 'the skills directory',
      link: path.join('.agents', 'skills'),
      target: 'outside-skills',
      skillsRootSuffix: '',
    },
    {
      description: 'an ancestor of the skills directory',
      link: '.agents',
      target: 'outside-agents',
      skillsRootSuffix: 'skills',
    },
  ])(
    'does not load skills through a symlinked $description outside the workDir',
    async ({ link, target, skillsRootSuffix }) => {
      const linkTarget = path.join(outsideDir, target);
      const externalSkillsRoot = path.join(linkTarget, skillsRootSuffix);
      await writeSkill({
        root: externalSkillsRoot,
        name: 'external-skill',
        description: 'CONTROLLED_SECRET_MARKER',
      });
      const linkPath = path.join(workDir, link);
      await mkdir(path.dirname(linkPath), { recursive: true });
      await symlink(linkTarget, linkPath);
      await writeSkill({
        root: path.join(homeDir, '.agents', 'skills'),
        name: 'harness-skill',
        description: 'Trusted harness skill.',
      });

      const skills = await loadSkills(createMiddlewares());

      expect(skills?.map(skill => skill.name)).toEqual(['harness-skill']);
      expect(JSON.stringify(skills)).not.toContain('CONTROLLED_SECRET_MARKER');
    },
  );

  it('does not load a SKILL.md symlink outside its trusted root', async () => {
    const skillsRoot = path.join(workDir, '.agents', 'skills');
    const skillDir = path.join(skillsRoot, 'external-skill');
    const externalSkillPath = path.join(outsideDir, 'SKILL.md');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      externalSkillPath,
      '---\nname: external-skill\ndescription: CONTROLLED_SECRET_MARKER\n---\nSkill body',
    );
    await symlink(externalSkillPath, path.join(skillDir, 'SKILL.md'));
    await writeSkill({
      root: path.join(homeDir, '.agents', 'skills'),
      name: 'harness-skill',
      description: 'Trusted harness skill.',
    });

    const skills = await loadSkills(createMiddlewares());

    expect(skills?.map(skill => skill.name)).toEqual(['harness-skill']);
    expect(JSON.stringify(skills)).not.toContain('CONTROLLED_SECRET_MARKER');
  });
});
