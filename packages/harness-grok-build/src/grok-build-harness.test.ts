import type { ACPHarnessSettings } from '@ai-sdk/harness-acp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGrokBuild } from './grok-build-harness';
import { VERSION } from './version';

const mocks = vi.hoisted(() => ({
  createACP: vi.fn(),
}));

vi.mock('@ai-sdk/harness-acp', () => ({
  createACP: mocks.createACP,
}));

describe('createGrokBuild', () => {
  beforeEach(() => {
    mocks.createACP.mockClear();
  });

  it('enforces the Grok Build ACP implementation', () => {
    createGrokBuild();

    const settings = mocks.createACP.mock.calls[0]?.[0] as ACPHarnessSettings;
    if (settings.implementation.mode !== 'locked') {
      throw new Error('Expected a locked Grok Build implementation.');
    }
    const implementation = {
      ...settings.implementation,
      packageJson: JSON.parse(settings.implementation.packageJson),
      pnpmLockYaml: '<pnpm-lock.yaml>',
    };
    expect(settings.implementation.pnpmLockYaml).toContain(
      "'@xai-official/grok@0.2.111'",
    );

    expect({
      version: settings.version,
      harnessId: settings.harnessId,
      clientApp: settings.clientApp,
      implementation,
      providerAuthentication: settings.providerAuthentication,
      builtinToolNames: Object.keys(settings.builtinTools ?? {}),
    }).toMatchInlineSnapshot(`
      {
        "builtinToolNames": [
          "bash",
          "edit",
          "grep",
          "webSearch",
          "write",
          "read_file",
          "list_dir",
          "kill_command_or_subagent",
          "todo_write",
          "get_command_or_subagent_output",
          "spawn_subagent",
          "scheduler_create",
          "scheduler_delete",
          "scheduler_list",
          "monitor",
          "search_tool",
          "use_tool",
          "workflow",
          "enter_plan_mode",
          "exit_plan_mode",
          "ask_user_question",
          "image_gen",
          "image_edit",
          "image_to_video",
          "reference_to_video",
        ],
        "clientApp": {
          "name": "ai-sdk/harness-grok-build",
          "version": "0.0.0-test",
        },
        "harnessId": "grok-build",
        "implementation": {
          "args": [
            "agent",
            "stdio",
          ],
          "executable": "grok",
          "forwardEnv": [
            "XAI_API_KEY",
          ],
          "mode": "locked",
          "packageJson": {
            "dependencies": {
              "@agentclientprotocol/sdk": "1.2.1",
              "@modelcontextprotocol/sdk": "1.29.0",
              "@xai-official/grok": "0.2.111",
              "ws": "8.21.0",
              "zod": "4.4.3",
            },
            "name": "harness-grok-build-bridge",
            "private": true,
            "type": "module",
            "version": "0.0.0",
          },
          "pnpmLockYaml": "<pnpm-lock.yaml>",
          "type": "npm",
        },
        "providerAuthentication": {
          "gateway": {
            "env": {
              "GROK_CLIENT_NAME": {
                "$source": "client-app-name",
              },
              "GROK_CLIENT_VERSION": {
                "$source": "client-app-version",
              },
              "GROK_MODELS_BASE_URL": {
                "$source": "gateway-base-url",
                "ensureSuffix": "/v1",
              },
              "GROK_XAI_API_BASE_URL": {
                "$source": "gateway-base-url",
                "ensureSuffix": "/v1",
              },
              "XAI_API_KEY": {
                "$source": "gateway-api-key",
              },
            },
          },
        },
        "version": "v1",
      }
    `);
  });

  it('forwards user-configurable settings', () => {
    createGrokBuild({
      auth: 'direct',
      model: 'grok-code-fast-1',
      port: 4319,
      startupTimeoutMs: 45_000,
    });

    const settings = mocks.createACP.mock.calls[0]?.[0] as ACPHarnessSettings;

    expect({
      auth: settings.auth,
      modelId: settings.modelId,
      port: settings.port,
      startupTimeoutMs: settings.startupTimeoutMs,
    }).toEqual({
      auth: 'direct',
      modelId: 'grok-code-fast-1',
      port: 4319,
      startupTimeoutMs: 45_000,
    });
  });

  it('exposes a test version outside the bundle', () => {
    expect(VERSION).toBe('0.0.0-test');
  });
});
