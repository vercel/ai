import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

/**
 * Reproduces https://github.com/vercel/ai/issues/18333 through an in-process
 * OpenAI-compatible fallback gateway and the public streamText API.
 *
 * Run from examples/ai-functions with OPENAI_API_KEY and ANTHROPIC_API_KEY
 * set. The gateway deliberately uses a nonexistent OpenAI model to trigger a
 * real fallback request to Anthropic. It saves the upstream and translated
 * responses under output/issue-18333/ before AI SDK consumes the stream.
 * Sanitized captures from a successful run are checked in under
 * src/reproduction/fixtures/issue-18333/.
 */

const traceDirectory = path.resolve('output/issue-18333');
const fallbackModel = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5';

interface AnthropicStreamEvent {
  type: string;
  index?: number;
  content_block?: {
    type: string;
    id?: string;
    name?: string;
    text?: string;
  };
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
    stop_reason?: string | null;
  };
  message?: {
    id?: string;
    model?: string;
  };
}

interface OpenAICompatibleChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: Record<string, unknown>;
    finish_reason: string | null;
  }>;
}

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (value == null || value.length === 0) {
    throw new Error(`${name} is not set.`);
  }
  return value;
}

function parseAnthropicSse(trace: string): AnthropicStreamEvent[] {
  const events: AnthropicStreamEvent[] = [];

  for (const block of trace.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice('data:'.length).trimStart())
      .join('\n');

    if (data.length > 0) {
      events.push(JSON.parse(data) as AnthropicStreamEvent);
    }
  }

  return events;
}

function translateAnthropicSse(trace: string): {
  trace: string;
  toolCallIndexes: number[];
} {
  let responseId = 'fallback-response';
  let model = fallbackModel;
  const output: string[] = [];
  const toolCallIndexes: number[] = [];

  const emit = (
    delta: Record<string, unknown>,
    finishReason: string | null = null,
  ) => {
    const chunk: OpenAICompatibleChunk = {
      id: responseId,
      object: 'chat.completion.chunk',
      created: 0,
      model,
      choices: [
        {
          index: 0,
          delta,
          finish_reason: finishReason,
        },
      ],
    };
    output.push(`data: ${JSON.stringify(chunk)}\n\n`);
  };

  for (const event of parseAnthropicSse(trace)) {
    if (event.type === 'message_start') {
      responseId = event.message?.id ?? responseId;
      model = event.message?.model ?? model;
      emit({ role: 'assistant' });
      continue;
    }

    if (
      event.type === 'content_block_start' &&
      event.content_block?.type === 'text' &&
      event.content_block.text
    ) {
      emit({ content: event.content_block.text });
      continue;
    }

    if (
      event.type === 'content_block_start' &&
      event.content_block?.type === 'tool_use'
    ) {
      if (event.index == null) {
        throw new Error('Anthropic tool_use block did not include an index.');
      }

      toolCallIndexes.push(event.index);
      emit({
        tool_calls: [
          {
            // This is the gateway bug: an Anthropic content-block index is not
            // necessarily a zero-based index among OpenAI tool calls.
            index: event.index,
            id: event.content_block.id,
            type: 'function',
            function: {
              name: event.content_block.name,
              arguments: '',
            },
          },
        ],
      });
      continue;
    }

    if (
      event.type === 'content_block_delta' &&
      event.delta?.type === 'text_delta'
    ) {
      emit({ content: event.delta.text ?? '' });
      continue;
    }

    if (
      event.type === 'content_block_delta' &&
      event.delta?.type === 'input_json_delta'
    ) {
      if (event.index == null) {
        throw new Error('Anthropic tool input delta did not include an index.');
      }

      emit({
        tool_calls: [
          {
            index: event.index,
            function: { arguments: event.delta.partial_json ?? '' },
          },
        ],
      });
      continue;
    }

    if (event.type === 'message_delta') {
      emit({}, event.delta?.stop_reason === 'tool_use' ? 'tool_calls' : 'stop');
      continue;
    }

    if (event.type === 'message_stop') {
      output.push('data: [DONE]\n\n');
    }
  }

  return { trace: output.join(''), toolCallIndexes };
}

async function makeFallbackResponse(
  requestBody: string,
): Promise<{ trace: string; toolCallIndexes: number[] }> {
  const openAIKey = requireEnvironmentVariable('OPENAI_API_KEY');
  const anthropicKey = requireEnvironmentVariable('ANTHROPIC_API_KEY');
  const parsedRequest = JSON.parse(requestBody) as Record<string, unknown>;

  await mkdir(traceDirectory, { recursive: true });
  await writeFile(
    path.join(traceDirectory, '00-client-request.json'),
    `${JSON.stringify(parsedRequest, null, 2)}\n`,
  );

  const primaryResponse = await fetch(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAIKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...parsedRequest,
        model: 'issue-18333-force-fallback',
        stream: true,
      }),
    },
  );
  const primaryBody = await primaryResponse.text();

  await writeFile(
    path.join(traceDirectory, '01-primary-openai-response.txt'),
    `HTTP ${primaryResponse.status} ${primaryResponse.statusText}\n\n${primaryBody}\n`,
  );

  if (primaryResponse.ok) {
    throw new Error(
      'The intentionally invalid primary model unexpectedly worked.',
    );
  }

  console.log(
    `Primary OpenAI request failed with ${primaryResponse.status}; falling back to Anthropic.`,
  );

  const fallbackResponse = await fetch(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: fallbackModel,
        max_tokens: 256,
        stream: true,
        messages: [
          {
            role: 'user',
            content:
              'In one assistant response, first output exactly "Reading it." as normal text, then call read_file with path "a.txt". You must do both in that order.',
          },
        ],
        tools: [
          {
            name: 'read_file',
            description: 'Read a text file.',
            input_schema: {
              type: 'object',
              properties: { path: { type: 'string' } },
              required: ['path'],
            },
          },
        ],
      }),
    },
  );
  const anthropicTrace = await fallbackResponse.text();

  await writeFile(
    path.join(traceDirectory, '02-fallback-anthropic.sse'),
    anthropicTrace,
  );

  if (!fallbackResponse.ok) {
    throw new Error(
      `Anthropic fallback failed with ${fallbackResponse.status}: ${anthropicTrace}`,
    );
  }

  const translated = translateAnthropicSse(anthropicTrace);
  await writeFile(
    path.join(traceDirectory, '03-gateway-openai-compatible.sse'),
    translated.trace,
  );

  console.log(`Saved traces to ${traceDirectory}`);
  console.log(
    `Translated OpenAI tool-call indexes: ${translated.toolCallIndexes.join(', ') || '(none)'}`,
  );

  if (!translated.toolCallIndexes.some(index => index > 0)) {
    throw new Error(
      `Anthropic did not emit a non-zero tool block index. Inspect 02-fallback-anthropic.sse and retry with a different ANTHROPIC_MODEL.`,
    );
  }

  return translated;
}

run(async () => {
  requireEnvironmentVariable('OPENAI_API_KEY');
  requireEnvironmentVariable('ANTHROPIC_API_KEY');

  const gateway = createOpenAICompatible({
    name: 'issue-18333-fallback-gateway',
    baseURL: 'https://issue-18333-fallback-gateway.invalid/v1',
    apiKey: 'local-example',
    fetch: async (_url, init) => {
      if (typeof init?.body !== 'string') {
        throw new Error('Expected AI SDK to send a JSON request body.');
      }

      const translated = await makeFallbackResponse(init.body);
      return new Response(translated.trace, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    },
  });

  const result = streamText({
    model: gateway.chatModel('fallback-demo'),
    maxRetries: 0,
    prompt: 'Read a.txt.',
    tools: {
      read_file: tool({
        description: 'Read a text file.',
        inputSchema: z.object({ path: z.string() }),
      }),
    },
  });

  for await (const part of result.stream) {
    console.log(part.type, JSON.stringify(part));
  }
});
