import type { HarnessV1BuiltinTool } from '@ai-sdk/harness';
import type { ACPHarnessSettings } from '@ai-sdk/harness-acp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFx } from './fx-harness';
import { VERSION } from './version';

const mocks = vi.hoisted(() => ({
  createACP: vi.fn(),
}));

vi.mock('@ai-sdk/harness-acp', () => ({
  createACP: mocks.createACP,
}));

describe('createFx', () => {
  beforeEach(() => {
    mocks.createACP.mockClear();
  });

  it('enforces the fx ACP implementation', () => {
    createFx();

    const settings = mocks.createACP.mock.calls[0]?.[0] as ACPHarnessSettings;

    expect({
      version: settings.version,
      harnessId: settings.harnessId,
      clientApp: settings.clientApp,
      source: settings.source,
      executable: settings.executable,
      args: settings.args,
      credentialEnv: settings.credentialEnv,
      providerAuthentication: settings.providerAuthentication,
      permissionModeMapping: settings.permissionModeMapping,
      builtinTools: Object.fromEntries(
        Object.entries(
          (settings.builtinTools ?? {}) as Record<string, HarnessV1BuiltinTool>,
        ).map(([name, value]) => [
          name,
          {
            nativeName: value.nativeName,
            commonName: value.commonName,
            toolUseKind: value.toolUseKind,
          },
        ]),
      ),
    }).toMatchInlineSnapshot(`
      {
        "args": [
          "acp",
        ],
        "builtinTools": {
          "ask_user_question": {
            "commonName": undefined,
            "nativeName": undefined,
            "toolUseKind": undefined,
          },
          "copy_file": {
            "commonName": undefined,
            "nativeName": undefined,
            "toolUseKind": "edit",
          },
          "create_folder": {
            "commonName": undefined,
            "nativeName": undefined,
            "toolUseKind": "edit",
          },
          "delete_file": {
            "commonName": undefined,
            "nativeName": undefined,
            "toolUseKind": "edit",
          },
          "edit_file": {
            "commonName": undefined,
            "nativeName": undefined,
            "toolUseKind": "edit",
          },
          "file_info": {
            "commonName": undefined,
            "nativeName": undefined,
            "toolUseKind": "readonly",
          },
          "glob": {
            "commonName": "glob",
            "nativeName": "glob_files",
            "toolUseKind": "readonly",
          },
          "grep": {
            "commonName": "grep",
            "nativeName": "grep_files",
            "toolUseKind": "readonly",
          },
          "install_skill": {
            "commonName": undefined,
            "nativeName": undefined,
            "toolUseKind": "edit",
          },
          "list_files": {
            "commonName": undefined,
            "nativeName": undefined,
            "toolUseKind": "readonly",
          },
          "mcp_features": {
            "commonName": undefined,
            "nativeName": undefined,
            "toolUseKind": "readonly",
          },
          "mcp_search_tools": {
            "commonName": undefined,
            "nativeName": undefined,
            "toolUseKind": "readonly",
          },
          "mcp_select_tool": {
            "commonName": undefined,
            "nativeName": undefined,
            "toolUseKind": "readonly",
          },
          "memory": {
            "commonName": undefined,
            "nativeName": undefined,
            "toolUseKind": undefined,
          },
          "open_file": {
            "commonName": undefined,
            "nativeName": undefined,
            "toolUseKind": undefined,
          },
          "read_file": {
            "commonName": undefined,
            "nativeName": undefined,
            "toolUseKind": "readonly",
          },
          "read_tool_result": {
            "commonName": undefined,
            "nativeName": undefined,
            "toolUseKind": "readonly",
          },
          "rename_file": {
            "commonName": undefined,
            "nativeName": undefined,
            "toolUseKind": "edit",
          },
          "semantic_search": {
            "commonName": undefined,
            "nativeName": undefined,
            "toolUseKind": "readonly",
          },
          "skill": {
            "commonName": undefined,
            "nativeName": undefined,
            "toolUseKind": "readonly",
          },
          "subagent": {
            "commonName": undefined,
            "nativeName": undefined,
            "toolUseKind": undefined,
          },
          "terminal": {
            "commonName": undefined,
            "nativeName": undefined,
            "toolUseKind": "bash",
          },
          "vision": {
            "commonName": undefined,
            "nativeName": undefined,
            "toolUseKind": undefined,
          },
          "webSearch": {
            "commonName": "webSearch",
            "nativeName": "web_search",
            "toolUseKind": "readonly",
          },
          "web_fetch": {
            "commonName": undefined,
            "nativeName": undefined,
            "toolUseKind": "readonly",
          },
          "write_file": {
            "commonName": undefined,
            "nativeName": undefined,
            "toolUseKind": "edit",
          },
        },
        "clientApp": {
          "name": "ai-sdk/harness-fx",
          "version": "0.0.0-test",
        },
        "credentialEnv": [
          "VERCEL_OIDC_TOKEN",
          "AI_GATEWAY_API_KEY",
        ],
        "executable": "fx",
        "harnessId": "fx",
        "permissionModeMapping": {
          "allow-all": {
            "modeId": "code",
            "type": "session-mode",
          },
          "allow-edits": {
            "modeId": "ask",
            "type": "session-mode",
          },
          "allow-reads": {
            "modeId": "ask",
            "type": "session-mode",
          },
        },
        "providerAuthentication": {
          "gateway": {
            "env": {
              "AI_GATEWAY_API_KEY": {
                "$source": "gateway-api-key",
              },
              "AI_GATEWAY_BASE_URL": {
                "$source": "gateway-base-url",
              },
            },
          },
        },
        "source": {
          "command": "curl -fsSL https://fx.sh/setup.sh | bash",
          "type": "install-command",
        },
        "version": "v1",
      }
    `);
  });

  it('forwards user-configurable settings', () => {
    const mintBridgeToken = (sandboxId: string) => `token-for-${sandboxId}`;
    const credentialForwarding = async ({
      credential,
    }: {
      credential: string;
    }) => `ephemeral-${credential}`;
    const portEndpoint = { url: 'wss://sandbox.example/bridge' };
    createFx({
      auth: 'direct',
      credentialForwarding,
      model: 'openai/gpt-5.4',
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
      port: settings.port,
      portEndpoint: settings.portEndpoint,
      startupTimeoutMs: settings.startupTimeoutMs,
      mcpServers: settings.mcpServers,
      mintBridgeToken: settings.mintBridgeToken,
    }).toEqual({
      auth: 'direct',
      credentialForwarding,
      modelId: 'openai/gpt-5.4',
      port: 4319,
      portEndpoint,
      startupTimeoutMs: 45_000,
      mcpServers: { external: { command: 'external-mcp' } },
      mintBridgeToken,
    });
    expect(settings.modelMapping).toEqual({
      type: 'session-config-option',
      path: 'model',
    });
  });

  it('classifies tool calls from configured external MCP servers', () => {
    createFx({
      mcpServers: {
        context7: { type: 'http', url: 'https://mcp.context7.com/mcp' },
        'github 🚀': { command: 'github-mcp' },
      },
    });

    const settings = mocks.createACP.mock.calls[0]?.[0] as ACPHarnessSettings;
    const isMcpToolCall = settings.isMcpToolCall!;

    expect(
      isMcpToolCall({
        toolCallId: 'context7-call',
        title: 'mcp_context7_resolve-library-id',
      }),
    ).toBe(true);
    expect(
      isMcpToolCall({
        toolCallId: 'github-call',
        title: 'mcp_github______create_issue',
      }),
    ).toBe(true);
    expect(
      isMcpToolCall({
        toolCallId: 'host-tool-call',
        title: 'mcp_ai-sdk-harness-tools_weather',
      }),
    ).toBe(false);
    expect(
      isMcpToolCall({
        toolCallId: 'fx-mcp-discovery-call',
        title: 'mcp_search_tools',
      }),
    ).toBe(false);
    expect(
      isMcpToolCall({
        toolCallId: 'builtin-call',
        title: 'Reading file',
      }),
    ).toBe(false);
  });

  it('brokers fx credentials only to AI Gateway', () => {
    createFx();

    const settings = mocks.createACP.mock.calls[0]?.[0] as ACPHarnessSettings;

    expect(
      settings.credentialBrokering?.({
        env: {
          VERCEL_OIDC_TOKEN: 'oidc-secret',
          AI_GATEWAY_API_KEY: 'gateway-secret',
        },
        sandboxEnv: {
          VERCEL_OIDC_TOKEN: 'sandbox-oidc-secret',
          AI_GATEWAY_API_KEY: 'sandbox-gateway-secret',
        },
        headers: { 'x-tenant': 'acme' },
      }),
    ).toEqual([
      {
        match: {
          host: 'ai-gateway.vercel.sh',
          headers: [
            {
              key: { exact: 'Authorization' },
              value: { exact: 'Bearer sandbox-oidc-secret' },
            },
          ],
        },
        transform: {
          headers: {
            'x-tenant': 'acme',
            Authorization: 'Bearer oidc-secret',
            'x-client-app': 'ai-sdk/harness-fx/0.0.0-test',
          },
        },
      },
    ]);

    expect(
      settings.credentialBrokering?.({
        env: { AI_GATEWAY_API_KEY: 'gateway-secret' },
        sandboxEnv: { AI_GATEWAY_API_KEY: 'sandbox-gateway-secret' },
      }),
    ).toEqual([
      {
        match: {
          host: 'ai-gateway.vercel.sh',
          headers: [
            {
              key: { exact: 'Authorization' },
              value: { exact: 'Bearer sandbox-gateway-secret' },
            },
          ],
        },
        transform: {
          headers: {
            Authorization: 'Bearer gateway-secret',
            'x-client-app': 'ai-sdk/harness-fx/0.0.0-test',
          },
        },
      },
    ]);

    expect(
      settings.credentialBrokering?.({
        env: {
          AI_GATEWAY_API_KEY: 'gateway-secret',
          AI_GATEWAY_BASE_URL: 'https://gateway.example/v1',
        },
        sandboxEnv: {
          AI_GATEWAY_API_KEY: 'sandbox-gateway-secret',
        },
      }),
    ).toEqual([
      {
        match: {
          host: 'gateway.example',
          path: { startsWith: '/v1' },
          headers: [
            {
              key: { exact: 'Authorization' },
              value: { exact: 'Bearer sandbox-gateway-secret' },
            },
          ],
        },
        transform: {
          headers: {
            Authorization: 'Bearer gateway-secret',
            'x-client-app': 'ai-sdk/harness-fx/0.0.0-test',
          },
        },
      },
    ]);

    expect(settings.credentialBrokering?.({ env: {}, sandboxEnv: {} })).toEqual(
      [],
    );
  });

  it('brokers the Gateway key selected from a supplied authentication environment', () => {
    createFx({
      auth: {
        AI_GATEWAY_API_KEY: 'explicit-gateway-key',
        AI_GATEWAY_BASE_URL: 'https://gateway.example/v1',
      },
    });

    const settings = mocks.createACP.mock.calls[0]?.[0] as ACPHarnessSettings;

    expect(
      settings.credentialBrokering?.({
        env: {
          AI_GATEWAY_API_KEY: 'explicit-gateway-key',
          AI_GATEWAY_BASE_URL: 'https://gateway.example/v1',
          VERCEL_OIDC_TOKEN: 'ambient-oidc-token',
        },
        sandboxEnv: {
          AI_GATEWAY_API_KEY: 'sandbox-explicit-gateway-key',
          VERCEL_OIDC_TOKEN: 'sandbox-ambient-oidc-token',
        },
      }),
    ).toEqual([
      {
        match: {
          host: 'gateway.example',
          path: { startsWith: '/v1' },
          headers: [
            {
              key: { exact: 'Authorization' },
              value: { exact: 'Bearer sandbox-explicit-gateway-key' },
            },
          ],
        },
        transform: {
          headers: {
            Authorization: 'Bearer explicit-gateway-key',
            'x-client-app': 'ai-sdk/harness-fx/0.0.0-test',
          },
        },
      },
    ]);
  });

  it('exposes a test version outside the bundle', () => {
    expect(VERSION).toBe('0.0.0-test');
  });
});
