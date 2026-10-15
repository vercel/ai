import { fileURLToPath } from 'node:url';
import { execPath } from 'node:process';
import type * as acp from '@agentclientprotocol/sdk';
import { HarnessBridgeCapabilityUnsupportedError } from '@ai-sdk/harness/bridge';
import type { ACPHostToolMCPTransport } from '../acp-v1-settings';
import type { HostToolRelay } from './host-tool-relay';

/*
 * Builds the ACP `session/new` definition for the harness-owned MCP server
 * that exposes host tools. The stdio transport launches `host-tool-mcp.mjs`,
 * which bridges back to the relay over its private HTTP protocol. The http
 * transport points the ACP implementation straight at the relay's own MCP
 * endpoint, which is required by implementations that reject client-supplied
 * stdio MCP servers.
 */
export function createHostToolMcpServerDefinition({
  mcpTransport,
  relay,
  serverName,
  catalogPath,
  initialization,
  harnessId,
}: {
  mcpTransport: ACPHostToolMCPTransport;
  relay: Pick<HostToolRelay, 'url' | 'mcpUrl' | 'credential'>;
  serverName: string;
  catalogPath: string;
  initialization: Pick<acp.InitializeResponse, 'agentCapabilities'>;
  harnessId: string;
}): acp.McpServer {
  if (mcpTransport === 'stdio') {
    return {
      name: serverName,
      command: execPath,
      args: [fileURLToPath(new URL('./host-tool-mcp.mjs', import.meta.url))],
      env: [
        {
          name: 'AI_SDK_ACP_HOST_TOOLS_FILE',
          value: catalogPath,
        },
        {
          name: 'AI_SDK_ACP_HOST_TOOL_RELAY_URL',
          value: relay.url,
        },
        {
          name: 'AI_SDK_ACP_HOST_TOOL_RELAY_CREDENTIAL',
          value: relay.credential,
        },
      ],
    };
  }
  if (initialization.agentCapabilities?.mcpCapabilities?.http !== true) {
    throw new HarnessBridgeCapabilityUnsupportedError({
      harnessId,
      message:
        'This harness exposes host tools through an HTTP MCP server, but ' +
        'the ACP agent does not advertise support for HTTP MCP servers.',
    });
  }
  if (relay.mcpUrl == null) {
    throw new Error('The host tool MCP HTTP endpoint is unavailable.');
  }
  return {
    type: 'http',
    name: serverName,
    url: relay.mcpUrl,
    headers: [{ name: 'Authorization', value: `Bearer ${relay.credential}` }],
  };
}
