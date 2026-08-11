import {
  createMCPClient,
  type JSONRPCMessage,
  type MCPTransport,
} from '@ai-sdk/mcp';
import { openai } from '@ai-sdk/openai';
import { asSchema, generateText, stepCountIs } from 'ai';

const modelId = 'gpt-5-mini';
const toolName = 'expedia_hotels';
const inputSchema = {
  type: 'object',
  properties: {
    dev_custom_headers: {
      type: 'array',
    },
  },
} as const;

type Endpoint = 'chat' | 'responses';

class MissingItemsMCPTransport implements MCPTransport {
  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  protocolVersion?: string;

  async start() {}

  async send(message: JSONRPCMessage) {
    if (!('id' in message) || !('method' in message)) {
      return;
    }

    if (message.method === 'tools/list') {
      queueMicrotask(() => {
        this.onmessage?.({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            tools: [
              {
                name: toolName,
                description: 'Search Expedia hotels.',
                inputSchema,
              },
            ],
          },
        });
      });
      return;
    }

    if (message.method === 'tools/call') {
      queueMicrotask(() => {
        this.onmessage?.({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            content: [{ type: 'text', text: 'No search was performed.' }],
          },
        });
      });
      return;
    }

    throw new Error(`Unexpected MCP method: ${message.method}`);
  }

  async close() {
    this.onclose?.();
  }
}

async function callOpenAIDirectly(endpoint: Endpoint) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey == null) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const isChat = endpoint === 'chat';
  const response = await fetch(
    isChat
      ? 'https://api.openai.com/v1/chat/completions'
      : 'https://api.openai.com/v1/responses',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        isChat
          ? {
              model: modelId,
              messages: [
                {
                  role: 'user',
                  content:
                    'Call expedia_hotels with dev_custom_headers set to ["x"].',
                },
              ],
              tools: [
                {
                  type: 'function',
                  function: {
                    name: toolName,
                    parameters: inputSchema,
                  },
                },
              ],
              tool_choice: 'required',
            }
          : {
              model: modelId,
              input:
                'Call expedia_hotels with dev_custom_headers set to ["x"].',
              tools: [
                {
                  type: 'function',
                  name: toolName,
                  parameters: inputSchema,
                },
              ],
              tool_choice: 'required',
            },
      ),
    },
  );

  const body = await response.text();
  if (response.status === 401 || response.status === 403) {
    throw new Error(`OpenAI access failure (${response.status}): ${body}`);
  }
  if (response.status === 429) {
    throw new Error(`OpenAI quota or rate-limit failure (429): ${body}`);
  }

  return { status: response.status, body };
}

async function callThroughAiSdk(
  endpoint: Endpoint,
  tools: Awaited<
    ReturnType<Awaited<ReturnType<typeof createMCPClient>>['tools']>
  >,
) {
  const result = await generateText({
    model:
      endpoint === 'chat' ? openai.chat(modelId) : openai.responses(modelId),
    prompt: 'Call expedia_hotels with dev_custom_headers set to ["x"].',
    tools,
    toolChoice: 'required',
    stopWhen: stepCountIs(1),
    include: { requestBody: true },
  });

  return result.request.body;
}

function assertMissingItemsWasSent(endpoint: Endpoint, requestBody: unknown) {
  const body = (
    typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody
  ) as {
    tools?: Array<{
      parameters?: typeof inputSchema;
      function?: { parameters?: typeof inputSchema };
    }>;
  };
  const sentSchema =
    endpoint === 'chat'
      ? body.tools?.[0]?.function?.parameters
      : body.tools?.[0]?.parameters;
  const arraySchema = sentSchema?.properties.dev_custom_headers;

  if (arraySchema?.type !== 'array' || 'items' in arraySchema) {
    throw new Error(
      `${endpoint} did not send the MCP array schema without items`,
    );
  }
}

async function main() {
  const client = await createMCPClient({
    transport: new MissingItemsMCPTransport(),
    initialInitializeResult: {
      protocolVersion: '2025-11-25',
      capabilities: { tools: {} },
      serverInfo: { name: 'issue-6674-reproduction', version: '1.0.0' },
    },
  });

  try {
    const tools = await client.tools();
    const mcpSchema = await asSchema(tools[toolName].inputSchema).jsonSchema;
    const arraySchema = mcpSchema.properties?.dev_custom_headers;

    if (
      typeof arraySchema !== 'object' ||
      arraySchema == null ||
      arraySchema.type !== 'array' ||
      'items' in arraySchema
    ) {
      throw new Error('MCPClient did not preserve the reported input schema');
    }

    const directChat = await callOpenAIDirectly('chat');
    const directResponses = await callOpenAIDirectly('responses');

    if (directChat.status !== 200 || directResponses.status !== 200) {
      throw new Error(
        `Direct OpenAI calls did not accept the schema: chat=${directChat.status}, responses=${directResponses.status}`,
      );
    }

    const sdkChatRequest = await callThroughAiSdk('chat', tools);
    const sdkResponsesRequest = await callThroughAiSdk('responses', tools);
    assertMissingItemsWasSent('chat', sdkChatRequest);
    assertMissingItemsWasSent('responses', sdkResponsesRequest);

    console.log(
      'ISSUE_6674_COULD_NOT_REPRODUCE: MCPClient preserved the missing-items schema and both OpenAI provider paths completed successfully',
    );
  } finally {
    await client.close();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
