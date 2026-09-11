import { HarnessBridgeCapabilityUnsupportedError } from '@ai-sdk/harness/bridge';
import { describe, expect, it } from 'vitest';
import { createHostToolMcpServerDefinition } from './host-tool-mcp-definition';

const relay = {
  url: 'http://127.0.0.1:5001/invoke',
  mcpUrl: 'http://127.0.0.1:5001/mcp',
  credential: 'relay-credential',
};

describe('createHostToolMcpServerDefinition', () => {
  it('launches the stdio MCP process for the stdio transport', () => {
    const definition = createHostToolMcpServerDefinition({
      mcpTransport: 'stdio',
      relay,
      serverName: 'ai-sdk-harness-tools',
      catalogPath: '/state/host-tools.json',
      initialization: {},
      harnessId: 'example-acp',
    });

    expect(definition).toMatchObject({
      name: 'ai-sdk-harness-tools',
      args: [expect.stringContaining('host-tool-mcp.mjs')],
      env: [
        {
          name: 'AI_SDK_ACP_HOST_TOOLS_FILE',
          value: '/state/host-tools.json',
        },
        {
          name: 'AI_SDK_ACP_HOST_TOOL_RELAY_URL',
          value: 'http://127.0.0.1:5001/invoke',
        },
        {
          name: 'AI_SDK_ACP_HOST_TOOL_RELAY_CREDENTIAL',
          value: 'relay-credential',
        },
      ],
    });
    expect(definition).not.toHaveProperty('type');
  });

  it('points at the relay MCP endpoint for the http transport', () => {
    const definition = createHostToolMcpServerDefinition({
      mcpTransport: 'http',
      relay,
      serverName: 'ai-sdk-harness-tools',
      catalogPath: '/state/host-tools.json',
      initialization: {
        agentCapabilities: { mcpCapabilities: { http: true, sse: true } },
      },
      harnessId: 'github-copilot',
    });

    expect(definition).toEqual({
      type: 'http',
      name: 'ai-sdk-harness-tools',
      url: 'http://127.0.0.1:5001/mcp',
      headers: [{ name: 'Authorization', value: 'Bearer relay-credential' }],
    });
  });

  it('reports an unsupported capability when the agent rejects HTTP MCP servers', () => {
    expect(() =>
      createHostToolMcpServerDefinition({
        mcpTransport: 'http',
        relay,
        serverName: 'ai-sdk-harness-tools',
        catalogPath: '/state/host-tools.json',
        initialization: {
          agentCapabilities: { mcpCapabilities: { http: false, sse: false } },
        },
        harnessId: 'github-copilot',
      }),
    ).toThrowError(
      expect.objectContaining({
        name: 'AI_HarnessBridgeCapabilityUnsupportedError',
        message: expect.stringContaining(
          'does not advertise support for HTTP MCP servers',
        ),
      }),
    );
  });

  it('reports an unsupported capability when the agent omits MCP capabilities', () => {
    let thrown: unknown;
    try {
      createHostToolMcpServerDefinition({
        mcpTransport: 'http',
        relay,
        serverName: 'ai-sdk-harness-tools',
        catalogPath: '/state/host-tools.json',
        initialization: {},
        harnessId: 'github-copilot',
      });
    } catch (error) {
      thrown = error;
    }

    expect(HarnessBridgeCapabilityUnsupportedError.isInstance(thrown)).toBe(
      true,
    );
  });

  it('fails when the relay did not start an MCP endpoint', () => {
    expect(() =>
      createHostToolMcpServerDefinition({
        mcpTransport: 'http',
        relay: { ...relay, mcpUrl: undefined },
        serverName: 'ai-sdk-harness-tools',
        catalogPath: '/state/host-tools.json',
        initialization: {
          agentCapabilities: { mcpCapabilities: { http: true, sse: true } },
        },
        harnessId: 'github-copilot',
      }),
    ).toThrowError('The host tool MCP HTTP endpoint is unavailable.');
  });
});
