import { createServer } from 'node:http';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { run } from '../../lib/run';

const modelId = 'gpt-5.3-codex';
const responseId = 'resp_copilot_repro';
const reasoningAddedId = 'rs_copilot_added';
const reasoningSummaryAddedId = 'rs_copilot_summary_added';
const reasoningSummaryDeltaId = 'rs_copilot_summary_delta';
const reasoningSummaryDoneId = 'rs_copilot_summary_done';
const reasoningDoneId = 'rs_copilot_done';
const messageAddedId = 'msg_copilot_added';
const messageDeltaId = 'msg_copilot_delta';
const messageDoneId = 'msg_copilot_done';

const response = {
  id: responseId,
  object: 'response',
  created_at: 1,
  status: 'in_progress',
  error: null,
  incomplete_details: null,
  input: [],
  instructions: null,
  max_output_tokens: null,
  model: modelId,
  output: [],
  parallel_tool_calls: true,
  previous_response_id: null,
  reasoning: { effort: 'low', summary: 'auto' },
  store: true,
  temperature: null,
  text: { format: { type: 'text' } },
  tool_choice: 'auto',
  tools: [],
  top_p: null,
  truncation: 'disabled',
  usage: null,
  user: null,
  metadata: {},
};

const reasoningItem = {
  id: reasoningDoneId,
  type: 'reasoning',
  summary: [{ type: 'summary_text', text: 'Thinking through the request.' }],
};

const messageItem = {
  id: messageDoneId,
  type: 'message',
  status: 'completed',
  role: 'assistant',
  content: [{ type: 'output_text', text: 'ok', annotations: [] }],
};

const events = [
  { type: 'response.created', response },

  // A live GitHub Copilot capture used a different opaque item id for every
  // reasoning and message event while keeping output_index stable.
  {
    type: 'response.output_item.added',
    output_index: 0,
    item: { id: reasoningAddedId, type: 'reasoning' },
  },
  {
    type: 'response.reasoning_summary_part.added',
    item_id: reasoningSummaryAddedId,
    output_index: 0,
    summary_index: 0,
  },
  {
    type: 'response.reasoning_summary_text.delta',
    item_id: reasoningSummaryDeltaId,
    output_index: 0,
    summary_index: 0,
    delta: 'Thinking through the request.',
  },
  {
    type: 'response.reasoning_summary_part.done',
    item_id: reasoningSummaryDoneId,
    output_index: 0,
    summary_index: 0,
  },
  {
    type: 'response.output_item.done',
    output_index: 0,
    item: reasoningItem,
  },
  {
    type: 'response.output_item.added',
    output_index: 1,
    item: { id: messageAddedId, type: 'message' },
  },
  {
    type: 'response.output_text.delta',
    item_id: messageDeltaId,
    output_index: 1,
    delta: 'ok',
  },
  {
    type: 'response.output_item.done',
    output_index: 1,
    item: messageItem,
  },
  {
    type: 'response.completed',
    response: {
      ...response,
      status: 'completed',
      output: [reasoningItem, messageItem],
      usage: {
        input_tokens: 5,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 8,
        output_tokens_details: { reasoning_tokens: 7 },
        total_tokens: 13,
      },
    },
  },
];

function toSse(value: unknown) {
  return `data: ${JSON.stringify(value)}\n\n`;
}

async function startMockCopilotServer() {
  const server = createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/responses') {
      response.writeHead(404).end();
      return;
    }

    request.resume();
    request.on('end', () => {
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        connection: 'close',
      });

      for (const event of events) {
        response.write(toSse(event));
      }

      response.end();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('Mock Copilot server did not bind to a TCP port.');
  }

  return {
    server,
    baseURL: `http://127.0.0.1:${address.port}/v1`,
  };
}

run(async () => {
  const { server, baseURL } = await startMockCopilotServer();

  try {
    const copilot = createOpenAI({
      apiKey: 'test-key',
      baseURL,
    });

    const result = streamText({
      model: copilot.responses(modelId),
      prompt: 'Reply with exactly: ok',
    });

    console.log('Expected: reasoning summary followed by "ok".');
    for await (const part of result.stream) {
      if (part.type === 'reasoning-delta' || part.type === 'text-delta') {
        process.stdout.write(part.text);
      }
    }
    console.log();
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error != null) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});
