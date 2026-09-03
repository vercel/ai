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
    if (settings.source.type !== 'npm-locked') {
      throw new Error('Expected a locked Grok Build source.');
    }
    const source = {
      ...settings.source,
      packageJson: JSON.parse(settings.source.packageJson),
      pnpmLockYaml: '<pnpm-lock.yaml>',
      pnpmWorkspaceYaml: '<pnpm-workspace.yaml>',
    };
    expect(settings.source.pnpmLockYaml).toContain(
      "'@xai-official/grok@1.0.5'",
    );
    expect(settings.source.pnpmWorkspaceYaml).toBe(
      "allowBuilds:\n  '@xai-official/grok@1.0.5': true\n",
    );

    expect({
      version: settings.version,
      harnessId: settings.harnessId,
      clientApp: settings.clientApp,
      source,
      executable: settings.executable,
      args: settings.args,
      credentialEnv: settings.credentialEnv,
      instructionMapping: settings.instructionMapping,
      outputSchemaMapping: settings.outputSchemaMapping,
      providerAuthentication: settings.providerAuthentication,
      builtinToolNames: Object.keys(settings.builtinTools ?? {}),
    }).toMatchInlineSnapshot(`
      {
        "args": [
          "agent",
          "stdio",
        ],
        "builtinToolNames": [
          "askUserQuestions",
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
          "image_gen",
          "image_edit",
          "image_to_video",
          "reference_to_video",
        ],
        "clientApp": {
          "name": "ai-sdk/harness-grok-build",
          "version": "0.0.0-test",
        },
        "credentialEnv": [
          "XAI_API_KEY",
        ],
        "executable": "grok",
        "harnessId": "grok-build",
        "instructionMapping": {
          "path": [
            "rules",
          ],
          "type": "session-meta",
        },
        "outputSchemaMapping": {
          "path": [
            "outputSchema",
          ],
          "type": "session-prompt-meta",
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
        "source": {
          "packageJson": {
            "dependencies": {
              "@agentclientprotocol/sdk": "1.4.0",
              "@modelcontextprotocol/sdk": "1.30.0",
              "@xai-official/grok": "1.0.5",
              "ws": "8.21.0",
              "zod": "4.4.3",
            },
            "name": "harness-grok-build-bridge",
            "private": true,
            "type": "module",
            "version": "0.0.0",
          },
          "pnpmLockYaml": "<pnpm-lock.yaml>",
          "pnpmWorkspaceYaml": "<pnpm-workspace.yaml>",
          "type": "npm-locked",
        },
        "version": "v1",
      }
    `);

    expect(
      settings.credentialBrokering?.({
        env: {
          XAI_API_KEY: 'xai-secret',
          GROK_XAI_API_BASE_URL: 'https://api.x.ai/v1',
        },
        sandboxEnv: {
          XAI_API_KEY: 'sandbox-xai-secret',
          GROK_XAI_API_BASE_URL: 'https://api.x.ai/v1',
        },
        headers: { 'x-tenant': 'acme' },
      }),
    ).toEqual([
      {
        match: {
          host: 'api.x.ai',
          path: { startsWith: '/v1' },
          headers: [
            {
              key: { exact: 'Authorization' },
              value: { exact: 'Bearer sandbox-xai-secret' },
            },
          ],
        },
        transform: {
          headers: {
            'x-tenant': 'acme',
            Authorization: 'Bearer xai-secret',
          },
        },
      },
    ]);
  });

  it('forwards user-configurable settings', () => {
    const mintBridgeToken = (sandboxId: string) => `token-for-${sandboxId}`;
    const credentialForwarding = async ({
      credential,
    }: {
      credential: string;
    }) => `ephemeral-${credential}`;
    const portEndpoint = { url: 'wss://sandbox.example/bridge' };
    createGrokBuild({
      auth: 'direct',
      credentialForwarding,
      model: 'grok-code-fast-1',
      reasoningEffort: 'high',
      port: 4319,
      portEndpoint,
      startupTimeoutMs: 45_000,
      mcpServers: { external: { command: 'external-mcp' } },
      mintBridgeToken,
    });

    const settings = mocks.createACP.mock.calls[0]?.[0] as ACPHarnessSettings;

    expect({
      auth: settings.auth,
      credentialForwarding: settings.credentialForwarding,
      modelId: settings.modelId,
      modelMapping: settings.modelMapping,
      args: settings.args,
      port: settings.port,
      portEndpoint: settings.portEndpoint,
      startupTimeoutMs: settings.startupTimeoutMs,
      mcpServers: settings.mcpServers,
      mintBridgeToken: settings.mintBridgeToken,
    }).toEqual({
      auth: 'direct',
      credentialForwarding,
      modelId: 'grok-code-fast-1',
      modelMapping: {
        type: 'session-model',
        path: 'modelId',
      },
      args: ['agent', '--reasoning-effort', 'high', 'stdio'],
      port: 4319,
      portEndpoint,
      startupTimeoutMs: 45_000,
      mcpServers: { external: { command: 'external-mcp' } },
      mintBridgeToken,
    });
  });

  it('configures reasoning effort without a model override', () => {
    createGrokBuild({ reasoningEffort: 'high' });

    const settings = mocks.createACP.mock.calls[0]?.[0] as ACPHarnessSettings;

    expect(settings.modelId).toBeUndefined();
    expect(settings.args).toEqual([
      'agent',
      '--reasoning-effort',
      'high',
      'stdio',
    ]);
    expect(settings.modelMapping).toEqual({
      type: 'session-model',
      path: 'modelId',
    });
  });

  it('delegates default model selection without a reasoning effort override', () => {
    createGrokBuild();

    const settings = mocks.createACP.mock.calls[0]?.[0] as ACPHarnessSettings;

    expect(settings.modelId).toBeUndefined();
    expect(settings.args).toEqual(['agent', 'stdio']);
    expect(settings.modelMapping).toEqual({
      type: 'session-model',
      path: 'modelId',
    });
  });

  it('configures a model without a reasoning effort override', () => {
    createGrokBuild({ model: 'grok-4.5-build' });

    const settings = mocks.createACP.mock.calls[0]?.[0] as ACPHarnessSettings;

    expect(settings.modelId).toBe('grok-4.5-build');
    expect(settings.modelMapping).toEqual({
      type: 'session-model',
      path: 'modelId',
    });
  });

  it('classifies Grok Build MCP tool calls from ACP metadata', () => {
    createGrokBuild();

    const settings = mocks.createACP.mock.calls[0]?.[0] as ACPHarnessSettings;

    expect(
      settings.isMcpToolCall?.({
        toolCallId: 'call-1',
        title: 'External MCP tool',
        _meta: { 'x.ai/tool': { namespace: 'mcp' } },
      }),
    ).toBe(true);
    expect(
      settings.isMcpToolCall?.({
        toolCallId: 'call-2',
        title: 'Unknown non-MCP tool',
        _meta: { 'x.ai/tool': { namespace: 'custom' } },
      }),
    ).toBe(false);
  });

  it('exposes a test version outside the bundle', () => {
    expect(VERSION).toBe('0.0.0-test');
  });
});
