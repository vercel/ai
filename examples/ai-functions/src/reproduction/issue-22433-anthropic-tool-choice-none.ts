import { anthropic } from '@ai-sdk/anthropic';
import {
  APICallError,
  generateText,
  jsonSchema,
  type ModelMessage,
  tool,
} from 'ai';

const modelId = 'claude-opus-5-5';

const tools = {
  tool_search: anthropic.tools.toolSearchBm25_20251119(),
  lookup_documents: tool({
    description: 'Look up documents for a company and topic.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        company: { type: 'string' },
        topic: { type: 'string' },
      },
      required: ['company', 'topic'],
      additionalProperties: false,
    }),
    providerOptions: {
      anthropic: { deferLoading: true },
    },
  }),
};

const rawTools = [
  {
    type: 'tool_search_tool_bm25_20251119',
    name: 'tool_search_tool_bm25',
  },
  {
    name: 'lookup_documents',
    description: 'Look up documents for a company and topic.',
    input_schema: {
      type: 'object',
      properties: {
        company: { type: 'string' },
        topic: { type: 'string' },
      },
      required: ['company', 'topic'],
      additionalProperties: false,
    },
    defer_loading: true,
  },
];

const rawMessages = [
  {
    role: 'user',
    content:
      'Find the document lookup tool, use it for Apple revenue, then answer.',
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'server_tool_use',
        id: 'srvtoolu_issue22433_completed_search',
        name: 'tool_search_tool_bm25',
        input: { query: 'Apple revenue document lookup' },
        caller: { type: 'direct' },
      },
      {
        type: 'tool_search_tool_result',
        tool_use_id: 'srvtoolu_issue22433_completed_search',
        content: {
          type: 'tool_search_tool_search_result',
          tool_references: [
            { type: 'tool_reference', tool_name: 'lookup_documents' },
          ],
        },
      },
      {
        type: 'tool_use',
        id: 'toolu_issue22433_lookup',
        name: 'lookup_documents',
        input: { company: 'Apple', topic: 'revenue' },
        caller: { type: 'direct' },
      },
    ],
  },
  {
    role: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id: 'toolu_issue22433_lookup',
        content: '{"text":"Net sales FY2025: $416.2B"}',
      },
      {
        type: 'text',
        text: 'Write your final answer now.',
      },
    ],
  },
];

const messages: ModelMessage[] = [
  {
    role: 'user',
    content:
      'Find the document lookup tool, use it for Apple revenue, then answer.',
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: 'srvtoolu_issue22433_completed_search',
        toolName: 'tool_search',
        input: { query: 'Apple revenue document lookup' },
        providerExecuted: true,
        providerOptions: {
          anthropic: { caller: { type: 'direct' } },
        },
      },
      {
        type: 'tool-result',
        toolCallId: 'srvtoolu_issue22433_completed_search',
        toolName: 'tool_search',
        output: {
          type: 'json',
          value: [{ type: 'tool_reference', toolName: 'lookup_documents' }],
        },
      },
      {
        type: 'tool-call',
        toolCallId: 'toolu_issue22433_lookup',
        toolName: 'lookup_documents',
        input: { company: 'Apple', topic: 'revenue' },
        providerOptions: {
          anthropic: { caller: { type: 'direct' } },
        },
      },
    ],
  },
  {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: 'toolu_issue22433_lookup',
        toolName: 'lookup_documents',
        output: {
          type: 'json',
          value: { text: 'Net sales FY2025: $416.2B' },
        },
      },
    ],
  },
  {
    role: 'user',
    content: 'Write your final answer now.',
  },
];

async function callAnthropicDirectly() {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 512,
      messages: rawMessages,
      tools: rawTools,
      tool_choice: { type: 'none' },
    }),
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `Direct Anthropic native none request failed (${response.status}): ${body}`,
    );
  }

  const parsed = JSON.parse(body) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  if (!parsed.content?.some(part => part.type === 'text' && part.text)) {
    throw new Error(
      `Direct Anthropic native none request returned no final text: ${body}`,
    );
  }
}

async function main() {
  await callAnthropicDirectly();

  const auto = await generateText({
    model: anthropic(modelId),
    tools,
    toolChoice: 'auto',
    messages,
    maxOutputTokens: 512,
  });
  if (!auto.text) {
    throw new Error('The auto comparison returned no final text.');
  }

  try {
    const none = await generateText({
      model: anthropic(modelId),
      tools,
      toolChoice: 'none',
      messages,
      maxOutputTokens: 512,
    });

    if (!none.text) {
      throw new Error(
        'The native none request completed but returned no final text.',
      );
    }
  } catch (error) {
    if (!APICallError.isInstance(error)) {
      throw error;
    }

    const responseBody = error.responseBody ?? '';
    const requestBody = error.requestBodyValues as
      | { tools?: unknown; tool_choice?: unknown }
      | undefined;

    if (
      !responseBody.includes(
        "Tool reference 'lookup_documents' not found in available tools",
      )
    ) {
      throw error;
    }
    if (requestBody?.tools != null || requestBody?.tool_choice != null) {
      throw new Error(
        `Unexpected request shape for the reproduced failure: ${JSON.stringify(requestBody)}`,
      );
    }

    console.error(
      "ISSUE_22433_REPRODUCED: toolChoice 'none' dropped tools and invalidated completed tool-search history: Tool reference 'lookup_documents' not found in available tools",
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
