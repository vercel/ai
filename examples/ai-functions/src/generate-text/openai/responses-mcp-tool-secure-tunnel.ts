import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const tunnelId = process.env.OPENAI_MCP_TUNNEL_ID;
  if (!tunnelId) {
    throw new Error(
      'Set OPENAI_MCP_TUNNEL_ID to a configured tunnel ID and run its tunnel client. See https://developers.openai.com/api/docs/guides/secure-mcp-tunnels',
    );
  }

  const result = await generateText({
    model: openai.responses('gpt-5-mini'),
    prompt: 'Describe the read-only tools available from this MCP server.',
    tools: {
      mcp: openai.tools.mcp({
        serverLabel: 'private-server',
        tunnelId,
        allowedTools: { readOnly: true },
        requireApproval: 'always',
      }),
    },
  });

  // Inspect approval requests before implementing an approval continuation.
  console.dir(result.content, { depth: Infinity });
});
