import { posix } from 'node:path';
import type { ACPHarnessSettings } from '@ai-sdk/harness-acp';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { parse } from '@iarna/toml';
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

  it('enforces the Grok Build ACP agent', () => {
    createGrokBuild();

    const settings = mocks.createACP.mock.calls[0]?.[0] as ACPHarnessSettings;
    expect(settings.nonTextContentTypes).toEqual(['image']);
    expect(settings.prepareSandbox).toBeTypeOf('function');
    expect(settings.permissionModeMapping).toBeUndefined();
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
      "'@xai-official/grok@1.0.49'",
    );
    expect(settings.source.pnpmWorkspaceYaml).toContain(
      "'@xai-official/grok': true",
    );

    expect({
      version: settings.version,
      harnessId: settings.harnessId,
      clientApp: settings.clientApp,
      source,
      executable: settings.executable,
      args: settings.args,
      authentication: settings.authentication,
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
        "authentication": {
          "methodId": "xai.api_key",
        },
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
          "name": "ai-sdk-harness-grok-build",
          "version": "0.0.0-test",
        },
        "credentialEnv": [
          "XAI_API_KEY",
        ],
        "executable": "grok",
        "harnessId": "grok-build",
        "instructionMapping": {
          "path": ".grok/AGENTS.md",
          "type": "filesystem",
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
              "@agentclientprotocol/sdk": "1.7.0",
              "@modelcontextprotocol/sdk": "1.32.1",
              "@xai-official/grok": "1.0.49",
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

    expect(
      settings.credentialBrokering?.({
        env: {
          XAI_API_KEY: 'header.payload.host-signature',
          GROK_XAI_API_BASE_URL: 'https://cli-chat-proxy.grok.com/v1',
          GROK_CLI_CHAT_PROXY_BASE_URL: 'https://cli-chat-proxy.grok.com/v1',
        },
        sandboxEnv: {
          XAI_API_KEY: 'sandbox-placeholder',
        },
      }),
    ).toEqual([
      {
        match: {
          host: 'cli-chat-proxy.grok.com',
          path: { startsWith: '/v1' },
          headers: [
            {
              key: { exact: 'Authorization' },
              value: { exact: 'Bearer sandbox-placeholder' },
            },
          ],
        },
        transform: {
          headers: {
            Authorization: 'Bearer header.payload.host-signature',
            'X-XAI-Token-Auth': 'xai-grok-cli',
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
    const reconnect = {
      maxElapsedMs: 120_000,
      initialDelayMs: 100,
      maxDelayMs: 5_000,
    };
    createGrokBuild({
      auth: 'direct',
      credentialForwarding,
      reasoningEffort: 'high',
      port: 4319,
      portEndpoint,
      startupTimeoutMs: 45_000,
      hostDisconnectTimeoutMs: 60_000,
      reconnect,
      mcpServers: { external: { command: 'external-mcp' } },
      mintBridgeToken,
    });

    const settings = mocks.createACP.mock.calls[0]?.[0] as ACPHarnessSettings;

    expect({
      auth: settings.auth,
      credentialForwarding: settings.credentialForwarding,
      modelMapping: settings.modelMapping,
      args: settings.args,
      port: settings.port,
      portEndpoint: settings.portEndpoint,
      startupTimeoutMs: settings.startupTimeoutMs,
      hostDisconnectTimeoutMs: settings.hostDisconnectTimeoutMs,
      reconnect: settings.reconnect,
      mcpServers: settings.mcpServers,
      mintBridgeToken: settings.mintBridgeToken,
    }).toEqual({
      auth: 'direct',
      credentialForwarding,
      modelMapping: {
        type: 'session-model',
        path: 'modelId',
      },
      args: ['agent', '--reasoning-effort', 'high', 'stdio'],
      port: 4319,
      portEndpoint,
      startupTimeoutMs: 45_000,
      hostDisconnectTimeoutMs: 60_000,
      reconnect,
      mcpServers: { external: { command: 'external-mcp' } },
      mintBridgeToken,
    });
  });

  it('configures reasoning effort without a model override', () => {
    createGrokBuild({ reasoningEffort: 'high' });

    const settings = mocks.createACP.mock.calls[0]?.[0] as ACPHarnessSettings;

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

    expect(settings.args).toEqual(['agent', 'stdio']);
    expect(settings.modelMapping).toEqual({
      type: 'session-model',
      path: 'modelId',
    });
  });

  it('classifies Grok Build MCP tool calls from ACP metadata', () => {
    createGrokBuild();

    const settings = mocks.createACP.mock.calls[0]?.[0] as ACPHarnessSettings;

    expect(
      settings.isMcpToolCall({
        toolCallId: 'call-1',
        title: 'External MCP tool',
        _meta: { 'x.ai/tool': { namespace: 'mcp' } },
      }),
    ).toBe(true);
    expect(
      settings.isMcpToolCall({
        toolCallId: 'call-2',
        title: 'Unknown non-MCP tool',
        _meta: { 'x.ai/tool': { namespace: 'custom' } },
      }),
    ).toBe(false);
  });

  it('exposes a test version outside the bundle', () => {
    expect(VERSION).toBe('0.0.0-test');
  });

  it('returns the ACP harness without wrapping its lifecycle', () => {
    const harness = { doStart: vi.fn() };
    mocks.createACP.mockReturnValueOnce(harness);

    expect(createGrokBuild()).toBe(harness);
  });
});

describe('prepareSandbox', () => {
  const workDir = '/workspace/grok';

  function prepareSandbox(): NonNullable<ACPHarnessSettings['prepareSandbox']> {
    createGrokBuild();
    return (mocks.createACP.mock.calls.at(-1)![0] as ACPHarnessSettings)
      .prepareSandbox!;
  }

  it('creates the native read ask rule when configuration is absent', async () => {
    const { sandbox, files, configPath, run, writeTextFile, deleteFile } =
      preparationSandbox();
    const controller = new AbortController();

    await prepareSandbox()({
      sandbox,
      workDir,
      abortSignal: controller.signal,
    });

    expect(parse(files.get(configPath)!)).toMatchInlineSnapshot(`
      {
        "permission": {
          "ask": [
            "Read",
          ],
        },
      }
    `);
    expect(writeTextFile).toHaveBeenCalledOnce();
    const temporaryPath = writeTextFile.mock.calls[0]![0].path;
    expect(temporaryPath).toMatch(
      /^\/home\/agent\/\.grok\/config\.toml\.[\da-f-]+\.tmp$/,
    );
    expect(run).toHaveBeenCalledWith({
      command: `mkdir -p '/home/agent/.grok' && (umask 077; set -C; : > '${temporaryPath}')`,
      abortSignal: controller.signal,
    });
    expect(run).toHaveBeenCalledWith({
      command: `chmod 600 '${temporaryPath}' && mv -f '${temporaryPath}' '${configPath}'`,
      abortSignal: controller.signal,
    });
    expect(deleteFile).toHaveBeenCalledWith({ path: temporaryPath });
    expect(files.has(temporaryPath)).toBe(false);
  });

  it('preserves native settings and permission rules', async () => {
    const { sandbox, files, configPath } = preparationSandbox({
      content: [
        'model = "grok-build-0.1"',
        '[permission]',
        'ask = ["Bash"]',
        'allow = ["Read(/workspace/**)"]',
        'deny = ["Read(/private/**)"]',
        '[mcp_servers.example]',
        'command = "example-mcp"',
      ].join('\n'),
    });

    await prepareSandbox()({ sandbox, workDir });

    expect(parse(files.get(configPath)!)).toMatchInlineSnapshot(`
      {
        "mcp_servers": {
          "example": {
            "command": "example-mcp",
          },
        },
        "model": "grok-build-0.1",
        "permission": {
          "allow": [
            "Read(/workspace/**)",
          ],
          "ask": [
            "Bash",
            "Read",
          ],
          "deny": [
            "Read(/private/**)",
          ],
        },
      }
    `);
  });

  it('does not rewrite configuration that already asks for reads', async () => {
    const content =
      '# native configuration\n[permission]\nask = ["Read", "Bash"]\n';
    const { sandbox, files, configPath, writeTextFile } = preparationSandbox({
      content,
    });

    await prepareSandbox()({ sandbox, workDir });

    expect(files.get(configPath)).toBe(content);
    expect(writeTextFile).not.toHaveBeenCalled();
  });

  it('is idempotent across repeated preparation calls', async () => {
    const { sandbox, writeTextFile } = preparationSandbox({
      content: 'model = "grok"',
    });
    const prepare = prepareSandbox();

    await prepare({ sandbox, workDir });
    await prepare({ sandbox, workDir });

    expect(writeTextFile).toHaveBeenCalledOnce();
  });

  it.each([
    {
      grokHome: '/custom/grok home',
      homeDir: '/home/agent',
      expected: '/custom/grok home/config.toml',
    },
    {
      grokHome: '.native-grok',
      homeDir: '/home/agent',
      expected: '/workspace/grok/.native-grok/config.toml',
    },
    {
      grokHome: '',
      homeDir: '/custom/home',
      expected: '/custom/home/.grok/config.toml',
    },
  ])(
    'resolves native configuration at $expected',
    async ({ grokHome, homeDir, expected }) => {
      const { sandbox, files, run } = preparationSandbox({ grokHome, homeDir });

      await prepareSandbox()({ sandbox, workDir });

      expect(files.has(expected)).toBe(true);
      if (grokHome) {
        expect(
          run.mock.calls.some(
            ([options]) => options.command === 'printf "%s" "$HOME"',
          ),
        ).toBe(false);
      }
    },
  );

  it.each([
    'secret = "sensitive-value"\n[permission',
    'permission = "sensitive-value"',
    'permission = []',
    'permission = 2026-01-01T00:00:00Z',
    '[permission]\nask = "Read"',
    '[permission]\nask = [123]',
  ])(
    'rejects invalid configuration without overwriting it: %s',
    async content => {
      const { sandbox, files, configPath, writeTextFile } = preparationSandbox({
        content,
      });

      await expect(prepareSandbox()({ sandbox, workDir })).rejects.toThrow(
        /^Grok Build configuration /,
      );
      expect(files.get(configPath)).toBe(content);
      expect(writeTextFile).not.toHaveBeenCalled();
    },
  );

  it.each(['read', 'create', 'write', 'replace'] as const)(
    'preserves the original configuration when the %s operation fails',
    async operation => {
      const content = 'model = "grok"';
      const {
        sandbox,
        files,
        configPath,
        run,
        readTextFile,
        writeTextFile,
        deleteFile,
      } = preparationSandbox({ content });
      const failure = new Error('Sandbox filesystem failure.');
      if (operation === 'read') readTextFile.mockRejectedValueOnce(failure);
      if (operation === 'write') writeTextFile.mockRejectedValueOnce(failure);
      const originalRun = run.getMockImplementation()!;
      run.mockImplementation(async options => {
        if (
          (operation === 'create' && options.command.startsWith('mkdir -p ')) ||
          (operation === 'replace' && options.command.startsWith('chmod 600 '))
        ) {
          return { exitCode: 1, stdout: '', stderr: 'Filesystem failure.' };
        }
        return originalRun(options);
      });

      await expect(prepareSandbox()({ sandbox, workDir })).rejects.toThrow();
      expect(files.get(configPath)).toBe(content);
      expect(deleteFile).toHaveBeenCalledTimes(
        operation === 'write' || operation === 'replace' ? 1 : 0,
      );
    },
  );

  it('propagates cancellation without writing configuration', async () => {
    const { sandbox, run, writeTextFile } = preparationSandbox();
    const controller = new AbortController();
    const failure = new Error('Cancelled preparation.');
    controller.abort(failure);

    await expect(
      prepareSandbox()({ sandbox, workDir, abortSignal: controller.signal }),
    ).rejects.toBe(failure);
    expect(run).not.toHaveBeenCalled();
    expect(writeTextFile).not.toHaveBeenCalled();
  });

  it('cleans up a cancelled write without replacing configuration', async () => {
    const content = 'model = "grok"';
    const { sandbox, files, configPath, writeTextFile, deleteFile } =
      preparationSandbox({ content });
    const controller = new AbortController();
    const failure = new Error('Cancelled write.');
    writeTextFile.mockImplementationOnce(async () => {
      controller.abort(failure);
      throw failure;
    });

    await expect(
      prepareSandbox()({ sandbox, workDir, abortSignal: controller.signal }),
    ).rejects.toBe(failure);
    expect(files.get(configPath)).toBe(content);
    expect(deleteFile).toHaveBeenCalledOnce();
  });

  it('rejects failed configuration-directory resolution without writing files', async () => {
    const { sandbox, run, writeTextFile } = preparationSandbox();
    run.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: 'Resolution failed.',
    });

    await expect(prepareSandbox()({ sandbox, workDir })).rejects.toThrow(
      'Unable to resolve the Grok Build configuration directory.',
    );
    expect(writeTextFile).not.toHaveBeenCalled();
  });
});

function preparationSandbox({
  grokHome = '',
  homeDir = '/home/agent',
  content,
}: {
  grokHome?: string;
  homeDir?: string;
  content?: string;
} = {}) {
  const configPath = posix.resolve(
    '/workspace/grok',
    grokHome || `${homeDir}/.grok`,
    'config.toml',
  );
  const files = new Map<string, string>(
    content == null ? [] : [[configPath, content]],
  );
  const run = vi.fn<Experimental_SandboxSession['run']>(
    async ({ command, abortSignal }) => {
      abortSignal?.throwIfAborted();
      if (command === 'printf "%s" "${GROK_HOME:-}"') {
        return { exitCode: 0, stdout: grokHome, stderr: '' };
      }
      if (command === 'printf "%s" "$HOME"') {
        return { exitCode: 0, stdout: homeDir, stderr: '' };
      }
      const move = command.match(/ && mv -f '([^']+)' '([^']+)'$/);
      if (move != null) {
        files.set(move[2]!, files.get(move[1]!)!);
        files.delete(move[1]!);
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    },
  );
  const readTextFile = vi.fn<Experimental_SandboxSession['readTextFile']>(
    async ({ path, abortSignal }) => {
      abortSignal?.throwIfAborted();
      return files.get(path) ?? null;
    },
  );
  const writeTextFile = vi.fn<Experimental_SandboxSession['writeTextFile']>(
    async ({ path, content, abortSignal }) => {
      abortSignal?.throwIfAborted();
      files.set(path, content);
    },
  );
  const deleteFile = vi.fn<Experimental_SandboxSession['deleteFile']>(
    async ({ path }) => files.delete(path),
  );
  const sandbox = {
    run,
    readTextFile,
    writeTextFile,
    deleteFile,
  } as unknown as Experimental_SandboxSession;
  return {
    sandbox,
    files,
    configPath,
    run,
    readTextFile,
    writeTextFile,
    deleteFile,
  };
}

describe('resolveHostToolCall', () => {
  const serverName = 'ai-sdk-harness-tools';
  const toolNames = ['weather'];

  it.each([
    {
      tool_name: 'ai-sdk-harness-tools__weather',
      tool_input: { city: 'Paris' },
    },
    {
      variant: 'UseTool',
      tool_name: 'ai-sdk-harness-tools__weather',
      tool_input: { city: 'Paris' },
    },
  ])('resolves the captured use_tool raw input %j', rawInput => {
    expect(
      resolveHostToolCall()({
        toolCall: {
          toolCallId: 'call-1',
          title: 'use_tool',
          rawInput,
          _meta: {
            'x.ai/tool': {
              version: 1,
              name: 'use_tool',
              kind: 'use_tool',
              namespace: 'grok_build',
              label: 'Use Tool',
              read_only: false,
            },
          },
        },
        serverName,
        toolNames,
      }),
    ).toMatchInlineSnapshot(`
      {
        "input": {
          "city": "Paris",
        },
        "toolName": "weather",
      }
    `);
  });

  it.each([
    { query: 'weather', limit: 5 },
    { tool_name: 'other-server__weather', tool_input: { city: 'Paris' } },
    { tool_name: 'ai-sdk-harness-tools__unknown', tool_input: {} },
    { tool_name: 'ai-sdk-harness-tools__weather', tool_input: null },
  ])('does not resolve a mismatched raw input: %j', rawInput => {
    expect(
      resolveHostToolCall()({
        toolCall: { toolCallId: 'call-1', title: 'Tool', rawInput },
        serverName,
        toolNames,
      }),
    ).toBeUndefined();
  });
});

function resolveHostToolCall(): ACPHarnessSettings['resolveHostToolCall'] {
  createGrokBuild();
  return (mocks.createACP.mock.calls.at(-1)![0] as ACPHarnessSettings)
    .resolveHostToolCall;
}
