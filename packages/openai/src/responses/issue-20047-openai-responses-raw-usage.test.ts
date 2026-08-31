import {
  type LanguageModelV4Prompt,
  type LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OpenAIResponsesLanguageModel } from './openai-responses-language-model';

type FixtureUsage = Record<string, unknown> & {
  input_tokens_details: Record<string, unknown>;
  output_tokens_details: Record<string, unknown>;
};

type FixtureResponse = Record<string, unknown> & {
  usage: FixtureUsage | null;
  status?: string;
  incomplete_details?: unknown;
};

type FixtureEvent = Record<string, unknown> & {
  type: string;
  response?: FixtureResponse;
};

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const normalFixturePath =
  'src/responses/__fixtures__/issue-20047-openai-responses.json';
const streamingFixturePath =
  'src/responses/__fixtures__/issue-20047-openai-responses.chunks.txt';

function createModel() {
  return new OpenAIResponsesLanguageModel('gpt-4o-mini', {
    provider: 'openai',
    url: ({ path }) => `https://api.openai.com/v1${path}`,
    headers: () => ({ Authorization: 'Bearer APIKEY' }),
    generateId: mockId(),
  });
}

function readNormalFixture(): FixtureResponse & { usage: FixtureUsage } {
  return JSON.parse(
    fs.readFileSync(normalFixturePath, 'utf8'),
  ) as FixtureResponse & {
    usage: FixtureUsage;
  };
}

function readStreamingFixture(): FixtureEvent[] {
  return fs
    .readFileSync(streamingFixturePath, 'utf8')
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => JSON.parse(line) as FixtureEvent);
}

function addUnknownUsageSentinels(usage: FixtureUsage) {
  usage.future_usage = { preserved: true };
  usage.input_tokens_details.future_input_detail = ['preserve-me'];
  usage.output_tokens_details.future_output_detail = {
    nested: 'preserve-me',
  };
}

function asStreamChunks(events: FixtureEvent[]) {
  return events.map(event => `data: ${JSON.stringify(event)}\n\n`);
}

function getFinishEvent(
  events: LanguageModelV4StreamPart[],
): Extract<LanguageModelV4StreamPart, { type: 'finish' }> {
  const finish = events.find(
    (event): event is Extract<LanguageModelV4StreamPart, { type: 'finish' }> =>
      event.type === 'finish',
  );
  expect(finish).toBeDefined();
  return finish!;
}

function getTerminalResponse(events: FixtureEvent[]): FixtureResponse {
  const response = events.at(-1)?.response;
  expect(response).toBeDefined();
  return response!;
}

function getUsage(response: FixtureResponse): FixtureUsage {
  expect(response.usage).not.toBeNull();
  return response.usage!;
}

describe('issue #20047: preserve complete OpenAI Responses raw usage', () => {
  const server = createTestServer({
    'https://api.openai.com/v1/responses': {},
  });

  it('preserves the complete normal provider usage object without changing normalized usage', async () => {
    const providerResponse = readNormalFixture();
    server.urls['https://api.openai.com/v1/responses'].response = {
      type: 'json-value',
      body: providerResponse,
    };

    const result = await createModel().doGenerate({ prompt: TEST_PROMPT });

    expect(result.usage.inputTokens.total).toBe(12);
    expect(result.usage.outputTokens.total).toBe(2);
    expect(result.usage.raw).toStrictEqual(providerResponse.usage);
  });

  it('preserves unknown top-level and nested usage fields', async () => {
    const providerResponse = readNormalFixture();
    addUnknownUsageSentinels(providerResponse.usage);
    server.urls['https://api.openai.com/v1/responses'].response = {
      type: 'json-value',
      body: providerResponse,
    };

    const result = await createModel().doGenerate({ prompt: TEST_PROMPT });

    expect(result.usage.raw).toStrictEqual(providerResponse.usage);
  });

  it.each(['response.completed', 'response.incomplete'] as const)(
    'preserves complete %s terminal usage',
    async terminalType => {
      const events = readStreamingFixture();
      const terminal = events.at(-1)!;
      terminal.type = terminalType;
      const terminalResponse = getTerminalResponse(events);
      terminalResponse.status =
        terminalType === 'response.completed' ? 'completed' : 'incomplete';
      terminalResponse.incomplete_details =
        terminalType === 'response.completed'
          ? null
          : { reason: 'max_output_tokens' };
      const terminalUsage = getUsage(terminalResponse);

      server.urls['https://api.openai.com/v1/responses'].response = {
        type: 'stream-chunks',
        chunks: asStreamChunks(events),
      };

      const { stream } = await createModel().doStream({
        prompt: TEST_PROMPT,
      });
      const finish = getFinishEvent(await convertReadableStreamToArray(stream));

      expect(finish.usage.inputTokens.total).toBe(12);
      expect(finish.usage.outputTokens.total).toBe(2);
      expect(finish.usage.raw).toStrictEqual(terminalUsage);
    },
  );

  it('preserves complete late response.failed usage', async () => {
    const events = readStreamingFixture().slice(0, 3);
    const usage = getUsage(getTerminalResponse(readStreamingFixture()));
    addUnknownUsageSentinels(usage);
    events.push({
      type: 'response.failed',
      sequence_number: 3,
      response: {
        error: null,
        incomplete_details: { reason: 'max_output_tokens' },
        usage,
        reasoning: { context: null },
        service_tier: 'default',
      },
    });

    server.urls['https://api.openai.com/v1/responses'].response = {
      type: 'stream-chunks',
      chunks: asStreamChunks(events),
    };

    const { stream } = await createModel().doStream({ prompt: TEST_PROMPT });
    const finish = getFinishEvent(await convertReadableStreamToArray(stream));

    expect(finish.usage.raw).toStrictEqual(usage);
  });

  it('accepts nullable response.failed usage', async () => {
    const events = readStreamingFixture().slice(0, 3);
    events.push({
      type: 'response.failed',
      sequence_number: 3,
      response: {
        error: null,
        incomplete_details: null,
        usage: null,
        reasoning: null,
        service_tier: null,
      },
    });

    server.urls['https://api.openai.com/v1/responses'].response = {
      type: 'stream-chunks',
      chunks: asStreamChunks(events),
    };

    const { stream } = await createModel().doStream({ prompt: TEST_PROMPT });
    const finish = getFinishEvent(await convertReadableStreamToArray(stream));

    expect(finish.usage.raw).toBeUndefined();
  });

  it('rejects invalid documented total_tokens values', async () => {
    const providerResponse = readNormalFixture();
    providerResponse.usage.total_tokens = '14';
    server.urls['https://api.openai.com/v1/responses'].response = {
      type: 'json-value',
      body: providerResponse,
    };

    await expect(
      createModel().doGenerate({ prompt: TEST_PROMPT }),
    ).rejects.toThrow();
  });
});
