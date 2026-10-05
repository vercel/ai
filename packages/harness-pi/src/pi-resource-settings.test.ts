import {
  DefaultResourceLoader,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPiResourceSettings } from './pi-resource-settings';

describe('createPiResourceSettings', () => {
  let rootDir: string;
  let agentDir: string;
  let workDir: string;
  let globalSettingsPath: string;
  let projectSettingsPath: string;

  beforeEach(() => {
    rootDir = mkdtempSync(path.join(tmpdir(), 'pi-resource-settings-'));
    agentDir = path.join(rootDir, 'agent');
    workDir = path.join(rootDir, 'work');
    mkdirSync(agentDir);
    mkdirSync(path.join(workDir, '.pi'), { recursive: true });
    globalSettingsPath = path.join(agentDir, 'settings.json');
    projectSettingsPath = path.join(workDir, '.pi', 'settings.json');
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('excludes global and project packages without changing native settings', () => {
    const globalSettings = {
      packages: ['npm:global-package'],
      defaultModel: 'global-model',
      skills: ['./global-skills'],
    };
    const projectSettings = {
      packages: [{ source: 'npm:project-package', skills: ['**'] }],
      defaultModel: 'project-model',
      skills: ['./project-skills'],
    };
    writeFileSync(globalSettingsPath, JSON.stringify(globalSettings));
    writeFileSync(projectSettingsPath, JSON.stringify(projectSettings));
    const settingsManager = SettingsManager.create(workDir, agentDir);
    const resourceSettings = createPiResourceSettings(settingsManager);

    expect(resourceSettings.getGlobalSettings()).toEqual({
      ...globalSettings,
      packages: [],
    });
    expect(resourceSettings.getProjectSettings()).toEqual({
      ...projectSettings,
      packages: [],
    });
    expect(resourceSettings.getDefaultModel()).toBe('project-model');
    expect(settingsManager.getGlobalSettings()).toEqual(globalSettings);
    expect(settingsManager.getProjectSettings()).toEqual(projectSettings);
  });

  it('keeps packages excluded after reload without rewriting settings files', async () => {
    const settingsManager = SettingsManager.create(workDir, agentDir);
    const resourceSettings = createPiResourceSettings(settingsManager);
    const globalSettings = JSON.stringify({
      packages: ['npm:new-global-package'],
      defaultModel: 'updated-model',
    });
    const projectSettings = JSON.stringify({
      packages: ['npm:new-project-package'],
      skills: ['./updated-skills'],
    });
    writeFileSync(globalSettingsPath, globalSettings);
    writeFileSync(projectSettingsPath, projectSettings);

    await resourceSettings.reload();

    expect(resourceSettings.getGlobalSettings().packages).toEqual([]);
    expect(resourceSettings.getProjectSettings().packages).toEqual([]);
    expect(resourceSettings.getProjectSettings().skills).toEqual([
      './updated-skills',
    ]);
    expect(resourceSettings.getDefaultModel()).toBe('updated-model');
    expect(settingsManager.getGlobalSettings().packages).toEqual([
      'npm:new-global-package',
    ]);
    expect(readFileSync(globalSettingsPath, 'utf8')).toBe(globalSettings);
    expect(readFileSync(projectSettingsPath, 'utf8')).toBe(projectSettings);
  });

  it('preserves native settings writes through the resource view', async () => {
    const settingsManager = SettingsManager.inMemory({
      packages: ['npm:global-package'],
    });
    const resourceSettings = createPiResourceSettings(settingsManager);

    resourceSettings.setDefaultModel('updated-model');
    await resourceSettings.flush();
    await resourceSettings.reload();

    expect(settingsManager.getDefaultModel()).toBe('updated-model');
    expect(settingsManager.getGlobalSettings().packages).toEqual([
      'npm:global-package',
    ]);
    expect(resourceSettings.getGlobalSettings().packages).toEqual([]);
  });

  it('reloads real resources without resolving packages and keeps project skills', async () => {
    writeFileSync(
      globalSettingsPath,
      JSON.stringify({ packages: ['npm:must-not-install-global'] }),
    );
    writeFileSync(
      projectSettingsPath,
      JSON.stringify({ packages: ['npm:must-not-install-project'] }),
    );
    const skillDir = path.join(workDir, '.pi', 'skills', 'project-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: project-skill\ndescription: Project skill\n---\nSkill instructions.\n',
    );
    const resourceLoader = new DefaultResourceLoader({
      cwd: workDir,
      agentDir,
      settingsManager: createPiResourceSettings(
        SettingsManager.create(workDir, agentDir),
      ),
      noExtensions: true,
      noThemes: true,
      noPromptTemplates: true,
    });

    for (let reloadIndex = 0; reloadIndex < 2; reloadIndex++) {
      await resourceLoader.reload();
      expect(resourceLoader.getSkills().skills).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'project-skill' }),
        ]),
      );
    }
  });
});
