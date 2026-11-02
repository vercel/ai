import { ElicitResultSchema, validateJSONRPCMessage } from '@ai-sdk/mcp';
import { z } from 'zod/v4';

const protocolVersion = '2026-07-28';
const tool = {
  name: 'deploy',
  description: 'Simulate a deployment after asking for confirmation.',
  inputSchema: { type: 'object', properties: {} },
};
const callParams = z.object({
  name: z.literal('deploy'),
  inputResponses: z.object({ confirm: ElicitResultSchema }).optional(),
  requestState: z.string().optional(),
});

// Minimal stateless MCP endpoint for this example. No deployment is performed.
export async function POST(request: Request) {
  const message = validateJSONRPCMessage(await request.json());
  if (!('method' in message) || !('id' in message)) {
    return new Response(null, { status: 202 });
  }
  const result = (value: Record<string, unknown>) =>
    Response.json({
      jsonrpc: '2.0',
      id: message.id,
      result: { resultType: 'complete', ...value },
    });
  const error = (code: number, text: string) =>
    Response.json({
      jsonrpc: '2.0',
      id: message.id,
      error: { code, message: text },
    });

  if (
    request.headers.get('MCP-Protocol-Version') !== protocolVersion ||
    message.params?._meta?.['io.modelcontextprotocol/protocolVersion'] !==
      protocolVersion
  ) {
    return error(-32022, 'This example requires MCP 2026-07-28');
  }

  switch (message.method) {
    case 'server/discover':
      return result({
        supportedVersions: [protocolVersion],
        capabilities: { tools: {} },
        ttlMs: 0,
        cacheScope: 'private',
      });
    case 'tools/list':
      return result({ tools: [tool], ttlMs: 0, cacheScope: 'private' });
    case 'tools/call': {
      const parsed = callParams.safeParse(message.params);
      if (!parsed.success) return error(-32602, 'Invalid deploy parameters');
      const { inputResponses, requestState } = parsed.data;
      if (!inputResponses) {
        return result({
          resultType: 'input_required',
          requestState: 'demo-confirmation',
          inputRequests: {
            confirm: {
              method: 'elicitation/create',
              params: {
                mode: 'form',
                message: 'Approve the demo deployment?',
                requestedSchema: {
                  type: 'object',
                  properties: { confirmed: { type: 'boolean' } },
                  required: ['confirmed'],
                },
              },
            },
          },
        });
      }
      if (requestState !== 'demo-confirmation') {
        return error(-32602, 'The client did not echo requestState');
      }
      const answer = inputResponses.confirm;
      const approved =
        answer.action === 'accept' && answer.content?.confirmed === true;
      return result({
        content: [
          {
            type: 'text',
            text: approved
              ? 'Demo deployment approved.'
              : `Demo deployment not performed (${answer.action}).`,
          },
        ],
      });
    }
    default:
      return error(-32601, 'Method not found');
  }
}
