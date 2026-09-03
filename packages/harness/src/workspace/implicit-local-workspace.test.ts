import { existsSync } from 'node:fs';
import { mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSessionWorkDir } from '../agent/internal/sandbox-bootstrap';
import { localWorkspace } from './local-workspace';
import {
  resetImplicitLocalWorkspaceWarning,
  warnAboutImplicitLocalWorkspace,
} from './warn-implicit-local-workspace';

describe('resolveSessionWorkDir in workspace mode', () => {
  // A hosted sandbox is fresh, so a per-session subdirectory is right. A
  // workspace is rooted at the user's own project, where a subdirectory would
  // run the harness in an empty folder beside their files.
  it('uses the workspace root itself in workspace mode', () => {
    expect(
      resolveSessionWorkDir({
        defaultWorkingDirectory: '/repo',
        harnessId: 'claude-code',
        sessionId: 's1',
        workspaceIsSessionWorkDir: true,
      }),
    ).toBe('/repo');
  });

  it('uses a per-session subdirectory otherwise', () => {
    expect(
      resolveSessionWorkDir({
        defaultWorkingDirectory: '/sandbox',
        harnessId: 'claude-code',
        sessionId: 's1',
      }),
    ).toBe('/sandbox/claude-code-s1');
  });

  it('lets an explicit workDir win over workspace mode', () => {
    expect(
      resolveSessionWorkDir({
        defaultWorkingDirectory: '/repo',
        harnessId: 'claude-code',
        sessionId: 's1',
        workDir: 'sub',
        workspaceIsSessionWorkDir: true,
      }),
    ).toBe('/repo/sub');
  });
});

describe('implicit-workspace warning', () => {
  beforeEach(() => {
    resetImplicitLocalWorkspaceWarning();
    globalThis.AI_SDK_LOG_WARNINGS = undefined;
  });

  afterEach(() => {
    globalThis.AI_SDK_LOG_WARNINGS = undefined;
    vi.restoreAllMocks();
  });

  it('warns once per process, not once per session', () => {
    const emitted: string[] = [];
    globalThis.AI_SDK_LOG_WARNINGS = options => {
      for (const warning of options.warnings) {
        emitted.push(warning.type === 'other' ? warning.message : warning.type);
      }
    };

    warnAboutImplicitLocalWorkspace();
    warnAboutImplicitLocalWorkspace();
    warnAboutImplicitLocalWorkspace();

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toContain('no isolation');
  });

  // Consumers of a library should be able to turn its output off, and this
  // reuses the switch the rest of the AI SDK already documents.
  it('is silenced by AI_SDK_LOG_WARNINGS === false', () => {
    globalThis.AI_SDK_LOG_WARNINGS = false;
    const emitWarning = vi.spyOn(process, 'emitWarning');
    const consoleWarn = vi.spyOn(console, 'warn');

    warnAboutImplicitLocalWorkspace();

    expect(emitWarning).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it('falls back to process.emitWarning when no logger is set', () => {
    const emitWarning = vi
      .spyOn(process, 'emitWarning')
      .mockImplementation(() => {});

    warnAboutImplicitLocalWorkspace();

    expect(emitWarning).toHaveBeenCalledOnce();
    expect(String(emitWarning.mock.calls[0][0])).toContain(
      'neither `sandbox` nor `workspace`',
    );
  });
});

describe('workspace mode session work dir', () => {
  it('runs the session in the project directory itself, not a subdirectory', async () => {
    const stateRoot = await mkdtemp(
      join(await realpath(tmpdir()), 'ilw-state-'),
    );
    const previous = process.env.AI_SDK_HARNESS_STATE_DIR;
    process.env.AI_SDK_HARNESS_STATE_DIR = stateRoot;
    try {
      const projectPath = await mkdtemp(join(await realpath(tmpdir()), 'imp-'));
      const session = await localWorkspace({
        path: projectPath,
      }).provider.createSession();

      try {
        const sessionWorkDir = resolveSessionWorkDir({
          defaultWorkingDirectory: session.defaultWorkingDirectory,
          harnessId: 'claude-code',
          sessionId: 'abc',
          workspaceIsSessionWorkDir: true,
        });

        expect(sessionWorkDir).toBe(projectPath);
        expect(existsSync(sessionWorkDir)).toBe(true);
      } finally {
        await session.stop();
      }
    } finally {
      if (previous == null) {
        delete process.env.AI_SDK_HARNESS_STATE_DIR;
      } else {
        process.env.AI_SDK_HARNESS_STATE_DIR = previous;
      }
    }
  });
});
