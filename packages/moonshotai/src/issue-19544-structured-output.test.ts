import type {
  JSONSchema7,
  LanguageModelV2,
  LanguageModelV2Prompt,
} from '@ai-sdk/provider';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMoonshotAI } from './moonshotai-provider';

const TEST_PROMPT: LanguageModelV2Prompt = [
  {
    role: 'user',
    content: [
      { type: 'text', text: 'Return exactly the empty JSON object {}.' },
    ],
  },
];

const tupleSchema: JSONSchema7 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    pair: {
      type: 'array',
      items: [{ type: 'string' }, { type: 'number' }],
      minItems: 2,
      maxItems: 2,
    },
  },
  required: ['pair'],
  additionalProperties: false,
};

function readFixture(name: string): unknown {
  return JSON.parse(
    fs.readFileSync(
      `src/__fixtures__/moonshotai-issue-19544-${name}.json`,
      'utf8',
    ),
  );
}

function isNormalizedRequest(body: any): boolean {
  const jsonSchema = body.response_format?.json_schema;
  const pairSchema = jsonSchema?.schema?.properties?.pair;
  return (
    body.response_format?.type === 'json_schema' &&
    typeof jsonSchema.strict === 'boolean' &&
    jsonSchema.description == null &&
    jsonSchema.schema.$schema == null &&
    pairSchema.items == null &&
    Array.isArray(pairSchema.prefixItems)
  );
}

function createFixtureFetch(capturedBodies: unknown[]) {
  return async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    capturedBodies.push(body);

    if (isNormalizedRequest(body)) {
      return Response.json(readFixture('accepted'));
    }

    if (body.response_format?.type === 'json_object') {
      return Response.json(readFixture('json-object'));
    }

    return Response.json(readFixture('rejected'), { status: 400 });
  };
}

function getText(result: Awaited<ReturnType<LanguageModelV2['doGenerate']>>) {
  return result.content.find(part => part.type === 'text')?.text;
}

describe('issue #19544 Moonshot structured outputs', () => {
  it('returns a schema-conforming object for a nested tuple schema', async () => {
    const capturedBodies: unknown[] = [];
    const provider = createMoonshotAI({
      apiKey: 'test-api-key',
      fetch: createFixtureFetch(capturedBodies),
    });

    const result = await provider('kimi-k3').doGenerate({
      prompt: TEST_PROMPT,
      responseFormat: {
        type: 'json',
        name: 'named_pair',
        description: 'A required string-number pair.',
        schema: tupleSchema,
      },
    });

    expect(JSON.parse(getText(result) ?? 'null')).toEqual({
      pair: ['{}', 0],
    });
  });

  it('maps strictJsonSchema false into json_schema.strict without leaking it', async () => {
    const capturedBodies: any[] = [];
    const provider = createMoonshotAI({
      apiKey: 'test-api-key',
      fetch: createFixtureFetch(capturedBodies),
    });

    await provider('kimi-k3').doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        moonshotai: { strictJsonSchema: false },
      },
      responseFormat: {
        type: 'json',
        name: 'named_pair',
        schema: tupleSchema,
      },
    });

    expect(capturedBodies[0]).not.toHaveProperty('strictJsonSchema');
    expect(capturedBodies[0].response_format.json_schema.strict).toBe(false);
  });

  it('keeps the schema-less JSON-object fallback', async () => {
    const capturedBodies: any[] = [];
    const provider = createMoonshotAI({
      apiKey: 'test-api-key',
      fetch: createFixtureFetch(capturedBodies),
    });

    await provider('kimi-k3').doGenerate({
      prompt: TEST_PROMPT,
      responseFormat: { type: 'json' },
    });

    expect(capturedBodies[0].response_format).toEqual({
      type: 'json_object',
    });
  });
});
