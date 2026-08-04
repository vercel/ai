import { existsSync } from 'node:fs';
import { mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSessionWorkDir } from '../sandbox-bootstrap';
import { createLocalWorkspaceSandbox } from './local-workspace-sandbox';
import {
  resetMissingSandboxWarning,
  warnAboutMissingSandbox,
} from './warn-no-sandbox';

describe('resolveSessionWorkDir with runInCwd', () => {
  // A hosted sandbox is fresh, so a per-session subdirectory is right. The
  // implicit local sandbox is rooted at the user's own directory, where a
  // subdirectory would run the harness in an empty folder beside their files.
  it('uses the working directory itself when runInCwd is set', () => {
    expect(
      resolveSessionWorkDir({
        defaultWorkingDirectory: '/repo',
        harnessId: 'claude-code',
        sessionId: 's1',
        runInCwd: true,
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

  it('lets an explicit workDir win over runInCwd', () => {
    expect(
      resolveSessionWorkDir({
        defaultWorkingDirectory: '/repo',
        harnessId: 'claude-code',
        sessionId: 's1',
        workDir: 'sub',
        runInCwd: true,
      }),
    ).toBe('/repo/sub');
  });
});

describe('missing-sandbox warning', () => {
  beforeEach(() => {
    resetMissingSandboxWarning();
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

    warnAboutMissingSandbox();
    warnAboutMissingSandbox();
    warnAboutMissingSandbox();

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toContain('no isolation');
  });

  // Consumers of a library should be able to turn its output off, and this
  // reuses the switch the rest of the AI SDK already documents.
  it('is silenced by AI_SDK_LOG_WARNINGS === false', () => {
    globalThis.AI_SDK_LOG_WARNINGS = false;
    const emitWarning = vi.spyOn(process, 'emitWarning');
    const consoleWarn = vi.spyOn(console, 'warn');

    warnAboutMissingSandbox();

    expect(emitWarning).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it('falls back to process.emitWarning when no logger is set', () => {
    const emitWarning = vi
      .spyOn(process, 'emitWarning')
      .mockImplementation(() => {});

    warnAboutMissingSandbox();

    expect(emitWarning).toHaveBeenCalledOnce();
    expect(String(emitWarning.mock.calls[0][0])).toContain('no `sandbox`');
  });
});

describe('the implicit provider', () => {
  it('runs the session in the directory it was given, not a subdirectory', async () => {
    const projectPath = await mkdtemp(join(await realpath(tmpdir()), 'imp-'));
    const provider = createLocalWorkspaceSandbox({ path: projectPath });
    const session = await provider.createSession();

    try {
      const sessionWorkDir = resolveSessionWorkDir({
        defaultWorkingDirectory: session.defaultWorkingDirectory,
        harnessId: 'claude-code',
        sessionId: 'abc',
        runInCwd: true,
      });

      expect(sessionWorkDir).toBe(projectPath);
      expect(existsSync(sessionWorkDir)).toBe(true);
    } finally {
      await session.stop();
    }
  });
});
