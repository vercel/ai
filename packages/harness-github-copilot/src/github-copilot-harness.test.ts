import { asSchema } from '@ai-sdk/provider-utils';
import type { ACPHarnessSettings } from '@ai-sdk/harness-acp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGitHubCopilot } from './github-copilot-harness';

const mocks = vi.hoisted(() => ({
  createACP: vi.fn(settings => ({
    specificationVersion: 'harness-v1',
    harnessId: settings.harnessId,
    builtinTools: settings.builtinTools,
  })),
}));

vi.mock('@ai-sdk/harness-acp', () => ({
  createACP: mocks.createACP,
}));

describe('createGitHubCopilot', () => {
  beforeEach(() => {
    mocks.createACP.mockClear();
  });

  it('configures the GitHub Copilot ACP implementation', () => {
    createGitHubCopilot();

    const settings = lastSettings();
    expect({
      version: settings.version,
      harnessId: settings.harnessId,
      clientApp: settings.clientApp,
      sourceType: settings.source.type,
      executable: settings.executable,
      args: settings.args,
      forwardEnv: settings.forwardEnv,
      credentialEnv: settings.credentialEnv,
      hasCredentialBrokering: settings.credentialBrokering != null,
      providerAuthentication: settings.providerAuthentication,
      modelMapping: settings.modelMapping,
      skillsDirectory: settings.skillsDirectory,
      builtinToolNames: Object.keys(settings.builtinTools ?? {}),
    }).toMatchInlineSnapshot(`
      {
        "args": [
          "--acp",
          "--stdio",
          "--no-auto-update",
        ],
        "builtinToolNames": [
          "bash",
          "read_bash",
          "stop_bash",
          "list_bash",
          "view",
          "create",
          "edit",
          "web_fetch",
          "skill",
          "sql",
          "read_agent",
          "list_agents",
          "write_agent",
          "grep",
          "glob",
          "task",
        ],
        "clientApp": {
          "name": "ai-sdk/harness-github-copilot",
          "version": "0.0.0-test",
        },
        "credentialEnv": [
          "COPILOT_GITHUB_TOKEN",
          "GH_TOKEN",
          "GITHUB_TOKEN",
        ],
        "executable": "copilot",
        "forwardEnv": [
          "COPILOT_GH_HOST",
          "GH_HOST",
        ],
        "harnessId": "github-copilot",
        "hasCredentialBrokering": true,
        "modelMapping": {
          "path": "model",
          "type": "session-config-option",
        },
        "providerAuthentication": {
          "gateway": {
            "env": {
              "COPILOT_MODEL": "openai/gpt-5.5",
              "COPILOT_PROVIDER_API_KEY": {
                "$source": "gateway-api-key",
              },
              "COPILOT_PROVIDER_BASE_URL": {
                "$source": "gateway-base-url",
                "ensureSuffix": "/v1",
              },
              "COPILOT_PROVIDER_HEADERS": {
                "$source": "client-app",
                "prefix": "x-client-app: ",
              },
              "COPILOT_PROVIDER_TYPE": "openai",
              "COPILOT_PROVIDER_WIRE_API": "responses",
            },
          },
        },
        "skillsDirectory": ".copilot/skills",
        "sourceType": "npm-locked",
        "version": "v1",
      }
    `);

    const source = settings.source;
    expect(source.type).toBe('npm-locked');
    if (source.type !== 'npm-locked') {
      throw new Error('Expected a locked NPM source.');
    }
    expect(source.packageJson).toContain('"@github/copilot": "1.0.82"');
    expect(source.pnpmLockYaml).toContain("'@github/copilot@1.0.82':");
    expect(source.pnpmWorkspaceYaml).toBe(
      "allowBuilds:\n  '@github/copilot@1.0.82': true\n",
    );
  });

  it('brokers GitHub credentials using their sandbox placeholders', () => {
    createGitHubCopilot();

    expect(
      lastSettings().credentialBrokering?.({
        env: {
          COPILOT_GITHUB_TOKEN: 'github-secret',
          GH_TOKEN: 'second-github-secret',
        },
        sandboxEnv: {
          COPILOT_GITHUB_TOKEN: 'copilot-placeholder',
          GH_TOKEN: 'gh-placeholder',
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        {
          match: {
            host: 'github.com',
            headers: [
              {
                key: { exact: 'Authorization' },
                value: { exact: 'Bearer copilot-placeholder' },
              },
            ],
          },
          transform: {
            headers: { Authorization: 'Bearer github-secret' },
          },
        },
        {
          match: {
            host: '*.github.com',
            headers: [
              {
                key: { exact: 'Authorization' },
                value: { exact: 'token gh-placeholder' },
              },
            ],
          },
          transform: {
            headers: { Authorization: 'token second-github-secret' },
          },
        },
      ]),
    );
  });

  it('brokers GitHub credentials for the configured enterprise host', () => {
    createGitHubCopilot();

    const transformations = lastSettings().credentialBrokering?.({
      env: {
        COPILOT_GH_HOST: 'example.ghe.com',
        GITHUB_TOKEN: 'github-secret',
      },
      sandboxEnv: {
        COPILOT_GH_HOST: 'example.ghe.com',
        GITHUB_TOKEN: 'github-placeholder',
      },
    });

    expect(transformations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          match: expect.objectContaining({ host: 'example.ghe.com' }),
        }),
        expect.objectContaining({
          match: expect.objectContaining({ host: '*.example.ghe.com' }),
        }),
      ]),
    );
    expect(transformations).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          match: expect.objectContaining({ host: '*.github.com' }),
        }),
      ]),
    );
  });

  it('brokers the AI Gateway provider credential', () => {
    createGitHubCopilot();

    expect(
      lastSettings().credentialBrokering?.({
        env: {
          COPILOT_PROVIDER_API_KEY: 'gateway-secret',
          COPILOT_PROVIDER_BASE_URL: 'https://gateway.example/v1',
        },
        sandboxEnv: {
          COPILOT_PROVIDER_API_KEY: 'gateway-placeholder',
          COPILOT_PROVIDER_BASE_URL: 'https://gateway.example/v1',
        },
      }),
    ).toContainEqual({
      match: {
        host: 'gateway.example',
        path: { startsWith: '/v1' },
        headers: [
          {
            key: { exact: 'Authorization' },
            value: { exact: 'Bearer gateway-placeholder' },
          },
        ],
      },
      transform: {
        headers: { Authorization: 'Bearer gateway-secret' },
      },
    });
  });

  it('forwards launch and bridge settings', () => {
    const credentialForwarding = vi.fn();
    const mintBridgeToken = (sandboxId: string) => sandboxId;
    const mcpServers = { docs: { url: 'https://mcp.example' } };
    const portEndpoint = { url: 'wss://sandbox.example/bridge' };

    createGitHubCopilot({
      auth: 'direct',
      credentialForwarding,
      reasoningEffort: 'high',
      mcpServers,
      port: 4319,
      portEndpoint,
      startupTimeoutMs: 45_000,
      mintBridgeToken,
    });

    const settings = lastSettings();
    expect(settings).toMatchObject({
      auth: 'direct',
      credentialForwarding,
      args: ['--acp', '--stdio', '--no-auto-update', '--reasoning-effort=high'],
      mcpServers,
      port: 4319,
      portEndpoint,
      startupTimeoutMs: 45_000,
      mintBridgeToken,
    });
  });

  it.each([
    'none',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
  ] as const)('encodes the %s reasoning effort', reasoningEffort => {
    createGitHubCopilot({ reasoningEffort });
    expect(lastSettings().args).toContain(
      `--reasoning-effort=${reasoningEffort}`,
    );
  });

  it('classifies built-in and configured MCP title prefixes', () => {
    createGitHubCopilot({
      mcpServers: { docs: { command: 'docs-mcp' } },
    });
    const isMcpToolCall = lastSettings().isMcpToolCall!;

    expect(
      isMcpToolCall({
        toolCallId: 'github',
        title: 'github-mcp-server-search_code',
      }),
    ).toBe(true);
    expect(
      isMcpToolCall({
        toolCallId: 'configured',
        title: 'docs-search',
      }),
    ).toBe(true);
    expect(
      isMcpToolCall({
        toolCallId: 'native',
        title: 'Viewing README.md',
      }),
    ).toBe(false);
  });

  it('uses loose schemas for captured Copilot tool inputs', async () => {
    createGitHubCopilot();
    const tools = lastSettings().builtinTools!;

    await expect(
      asSchema(tools.bash!.inputSchema!).validate?.({
        command: 'pwd',
        description: 'Print the working directory',
        mode: 'async',
        futureField: true,
      }),
    ).resolves.toMatchObject({ success: true });
    await expect(
      asSchema(tools.task!.inputSchema!).validate?.({
        name: 'review',
        prompt: 'Review this repository',
        agent_type: 'code-review',
        description: 'Review code',
        context_tier: 'long_context',
        mode: 'background',
      }),
    ).resolves.toMatchObject({ success: true });
  });
});

function lastSettings(): ACPHarnessSettings<Record<string, any>> {
  return mocks.createACP.mock.calls.at(-1)![0] as ACPHarnessSettings<
    Record<string, any>
  >;
}
