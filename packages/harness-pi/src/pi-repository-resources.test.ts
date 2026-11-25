import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPiRepositoryResources } from './pi-repository-resources';

const workDir = '/sandbox/work';
const skillsRoot = `${workDir}/.agents/skills`;

describe('loadPiRepositoryResources', () => {
  let session: Awaited<ReturnType<typeof createJustBashNetworkSandboxSession>>;
  let sandbox: ReturnType<typeof session.restricted>;

  beforeEach(async () => {
    session = await createJustBashNetworkSandboxSession({ cwd: workDir });
    sandbox = session.restricted();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await session.destroy();
  });

  async function writeSkill({
    directory,
    frontmatter = 'description: Look up a stock price',
  }: {
    directory: string;
    frontmatter?: string;
  }): Promise<void> {
    await sandbox.writeTextFile({
      path: `${skillsRoot}/${directory}/SKILL.md`,
      content: `---\n${frontmatter}\n---\nGOOG: 123.45 USD`,
    });
  }

  it('tolerates missing resources and empty instructions', async () => {
    expect(await loadPiRepositoryResources({ sandbox, workDir })).toEqual({
      agentsFiles: [],
      skills: [],
      diagnostics: [],
    });
    await sandbox.writeTextFile({ path: `${workDir}/AGENTS.md`, content: '' });
    expect(await loadPiRepositoryResources({ sandbox, workDir })).toEqual({
      agentsFiles: [],
      skills: [],
      diagnostics: [],
    });
  });

  it('loads sandbox instructions and nested skills with native metadata', async () => {
    await sandbox.writeTextFile({
      path: `${workDir}/AGENTS.md`,
      content: 'Always respond in French.',
    });
    await writeSkill({
      directory: 'finance/stock-price',
      frontmatter:
        'name: get-stock-price\ndescription: >-\n  Look up a\n  stock price\ndisable-model-invocation: true',
    });

    expect(await loadPiRepositoryResources({ sandbox, workDir }))
      .toMatchInlineSnapshot(`
        {
          "agentsFiles": [
            {
              "content": "Always respond in French.",
              "path": "/sandbox/work/AGENTS.md",
            },
          ],
          "diagnostics": [],
          "skills": [
            {
              "baseDir": "/sandbox/work/.agents/skills/finance/stock-price",
              "description": "Look up a stock price",
              "disableModelInvocation": true,
              "filePath": "/sandbox/work/.agents/skills/finance/stock-price/SKILL.md",
              "name": "get-stock-price",
              "sourceInfo": {
                "baseDir": "/sandbox/work/.agents/skills/finance/stock-price",
                "origin": "top-level",
                "path": "/sandbox/work/.agents/skills/finance/stock-price/SKILL.md",
                "scope": "project",
                "source": "local",
              },
            },
          ],
        }
      `);
  });

  it('only reads AGENTS.md and SKILL.md, not configuration or skill assets', async () => {
    await writeSkill({ directory: 'stock-price' });
    await writeSkill({ directory: 'stock-price/examples/nested' });
    await writeSkill({ directory: '.hidden' });
    await writeSkill({ directory: 'node_modules/dependency' });
    for (const filePath of [
      `${workDir}/.pi/settings.json`,
      `${workDir}/.pi/extensions/hook.ts`,
      `${workDir}/.claude/settings.json`,
      `${workDir}/.mcp.json`,
      `${skillsRoot}/hooks.json`,
      `${skillsRoot}/stock-price/references/prices.json`,
    ]) {
      await sandbox.writeTextFile({ path: filePath, content: '{}' });
    }
    const link = await sandbox.run({
      command: `ln -s '${skillsRoot}' '${skillsRoot}/loop'`,
    });
    expect(link.exitCode).toBe(0);
    const readTextFile = vi.spyOn(sandbox, 'readTextFile');

    const resources = await loadPiRepositoryResources({ sandbox, workDir });

    expect(resources.skills.map(skill => skill.name)).toEqual(['stock-price']);
    expect(readTextFile.mock.calls.map(([options]) => options.path)).toEqual([
      `${workDir}/AGENTS.md`,
      `${skillsRoot}/stock-price/SKILL.md`,
    ]);
  });

  it.each([
    {
      description: 'outside the workDir',
      target: '/sandbox/outside/secret.txt',
      deniedRoots: [],
    },
    {
      description: 'inside a denied root',
      target: `${workDir}/private/secret.txt`,
      deniedRoots: [`${workDir}/private`],
    },
  ])('skips AGENTS.md symlinks targeting $description', async input => {
    await sandbox.writeTextFile({
      path: input.target,
      content: 'Sensitive instructions',
    });
    const link = await sandbox.run({
      command: `ln -s '${input.target}' '${workDir}/AGENTS.md'`,
    });
    expect(link.exitCode).toBe(0);
    const readTextFile = vi.spyOn(sandbox, 'readTextFile');

    const resources = await loadPiRepositoryResources({
      sandbox,
      workDir,
      deniedRoots: input.deniedRoots,
    });

    expect(resources.agentsFiles).toEqual([]);
    expect(readTextFile).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: input.target }),
    );
  });

  it.each([
    {
      description: 'outside the workDir',
      target: '/sandbox/outside',
      deniedRoots: [],
      linkCommand: `mkdir -p '${workDir}/.agents' && ln -s '/sandbox/outside' '${skillsRoot}'`,
    },
    {
      description: 'inside a denied root',
      target: `${workDir}/.agents/skills-private`,
      deniedRoots: [`${workDir}/.agents/skills-private`],
      linkCommand: `mkdir -p '${workDir}/.agents' && ln -s '${workDir}/.agents/skills-private' '${skillsRoot}'`,
    },
  ])('does not list skill roots targeting $description', async input => {
    await sandbox.writeTextFile({
      path: `${input.target}/stock/SKILL.md`,
      content: '---\ndescription: Sensitive skill\n---\nSensitive data',
    });
    const link = await sandbox.run({ command: input.linkCommand });
    expect(link.exitCode).toBe(0);
    const listDirectory = vi.spyOn(sandbox, 'listDirectory');

    const resources = await loadPiRepositoryResources({
      sandbox,
      workDir,
      deniedRoots: input.deniedRoots,
    });

    expect(resources.skills).toEqual([]);
    expect(listDirectory).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: input.target }),
    );
  });

  it('checks symlinked skill ancestors before listing them', async () => {
    const outsideSkillsRoot = '/sandbox/outside/skills';
    await sandbox.writeTextFile({
      path: `${outsideSkillsRoot}/stock/SKILL.md`,
      content: '---\ndescription: Sensitive skill\n---\nSensitive data',
    });
    const link = await sandbox.run({
      command: `ln -s '/sandbox/outside' '${workDir}/.agents'`,
    });
    expect(link.exitCode).toBe(0);
    const listDirectory = vi.spyOn(sandbox, 'listDirectory');

    const resources = await loadPiRepositoryResources({ sandbox, workDir });

    expect(resources.skills).toEqual([]);
    expect(listDirectory).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: outsideSkillsRoot }),
    );
  });

  it('loads an AGENTS.md symlink whose target stays within the workDir', async () => {
    await sandbox.writeTextFile({
      path: `${workDir}/instructions.md`,
      content: 'Always respond in French.',
    });
    const link = await sandbox.run({
      command: `ln -s '${workDir}/instructions.md' '${workDir}/AGENTS.md'`,
    });
    expect(link.exitCode).toBe(0);

    const resources = await loadPiRepositoryResources({ sandbox, workDir });

    expect(resources.agentsFiles).toEqual([
      {
        path: `${workDir}/AGENTS.md`,
        content: 'Always respond in French.',
      },
    ]);
  });

  it('does not read a SKILL.md inside a denied root', async () => {
    const skillPath = `${skillsRoot}/stock-price/SKILL.md`;
    await writeSkill({ directory: 'stock-price' });
    const readTextFile = vi.spyOn(sandbox, 'readTextFile');

    const resources = await loadPiRepositoryResources({
      sandbox,
      workDir,
      deniedRoots: [skillPath],
    });

    expect(resources.skills).toEqual([]);
    expect(readTextFile).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: skillPath }),
    );
  });

  it('reports malformed frontmatter and missing descriptions without hiding valid skills', async () => {
    await writeSkill({ directory: 'invalid-yaml', frontmatter: 'name: [' });
    await writeSkill({
      directory: 'missing-description',
      frontmatter: 'name: missing',
    });
    await writeSkill({
      directory: 'empty-description',
      frontmatter: 'description: " "',
    });
    await writeSkill({ directory: 'valid' });

    const resources = await loadPiRepositoryResources({ sandbox, workDir });

    expect(resources.skills.map(skill => skill.name)).toEqual(['valid']);
    expect(resources.diagnostics.map(({ type, path }) => ({ type, path })))
      .toMatchInlineSnapshot(`
        [
          {
            "path": "/sandbox/work/.agents/skills/empty-description/SKILL.md",
            "type": "warning",
          },
          {
            "path": "/sandbox/work/.agents/skills/invalid-yaml/SKILL.md",
            "type": "warning",
          },
          {
            "path": "/sandbox/work/.agents/skills/missing-description/SKILL.md",
            "type": "warning",
          },
        ]
      `);
    expect(resources.diagnostics[0]?.message).toBe('description is required');
    expect(resources.diagnostics[1]?.message).toContain('Flow sequence');
    expect(resources.diagnostics[2]?.message).toBe('description is required');
  });

  it('keeps the first skill when repository names collide', async () => {
    await writeSkill({
      directory: 'b',
      frontmatter: 'name: stock\ndescription: Second',
    });
    await writeSkill({
      directory: 'a',
      frontmatter: 'name: stock\ndescription: First',
    });

    const resources = await loadPiRepositoryResources({ sandbox, workDir });

    expect(resources.skills.map(skill => skill.description)).toEqual(['First']);
    expect(resources.diagnostics.map(diagnostic => diagnostic.collision))
      .toMatchInlineSnapshot(`
        [
          {
            "loserPath": "/sandbox/work/.agents/skills/b/SKILL.md",
            "name": "stock",
            "resourceType": "skill",
            "winnerPath": "/sandbox/work/.agents/skills/a/SKILL.md",
          },
        ]
      `);
    expect(resources.diagnostics[0]?.type).toBe('collision');
  });

  it('tolerates a skill disappearing between listing and reading it', async () => {
    await writeSkill({ directory: 'stock-price' });
    vi.spyOn(sandbox, 'readTextFile').mockResolvedValue(null);

    expect(await loadPiRepositoryResources({ sandbox, workDir })).toEqual({
      agentsFiles: [],
      skills: [],
      diagnostics: [],
    });
  });

  it('propagates sandbox I/O errors', async () => {
    const error = new Error('Sandbox unavailable');
    const read = vi.spyOn(sandbox, 'readTextFile').mockRejectedValueOnce(error);
    await expect(loadPiRepositoryResources({ sandbox, workDir })).rejects.toBe(
      error,
    );
    read.mockRestore();
    vi.spyOn(sandbox, 'listDirectory').mockRejectedValueOnce(error);
    await expect(loadPiRepositoryResources({ sandbox, workDir })).rejects.toBe(
      error,
    );
  });

  it('does not read resources when already aborted', async () => {
    const controller = new AbortController();
    const error = new Error('Cancelled');
    controller.abort(error);
    const read = vi.spyOn(sandbox, 'readTextFile');

    await expect(
      loadPiRepositoryResources({
        sandbox,
        workDir,
        abortSignal: controller.signal,
      }),
    ).rejects.toBe(error);
    expect(read).not.toHaveBeenCalled();
  });

  it('stops discovery when aborted during a sandbox read', async () => {
    const controller = new AbortController();
    const error = new Error('Cancelled');
    const run = vi.spyOn(sandbox, 'run');
    vi.spyOn(sandbox, 'readTextFile').mockImplementationOnce(async () => {
      controller.abort(error);
      return 'Instructions';
    });
    const list = vi.spyOn(sandbox, 'listDirectory');

    await expect(
      loadPiRepositoryResources({
        sandbox,
        workDir,
        abortSignal: controller.signal,
      }),
    ).rejects.toBe(error);
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: controller.signal }),
    );
    expect(list).not.toHaveBeenCalled();
  });
});
