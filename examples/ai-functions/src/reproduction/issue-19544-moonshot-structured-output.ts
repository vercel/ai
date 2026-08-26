import { createMoonshotAI } from '../../../../packages/moonshotai/src';
import { generateObject, jsonSchema } from '../../../../packages/ai/src';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

type PairResult = {
  pair: [string, number];
};

const schema = {
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
} as const;

const normalizedSchema = {
  type: 'object',
  properties: {
    pair: {
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'number' }],
      minItems: 2,
      maxItems: 2,
    },
  },
  required: ['pair'],
  additionalProperties: false,
} as const;

const prompt = 'Return exactly the empty JSON object {}.';

function readFixture(name: string): unknown {
  const fixtureUrl = new URL(
    `../../../../packages/moonshotai/src/__fixtures__/moonshotai-issue-19544-${name}.json`,
    import.meta.url,
  );
  return JSON.parse(fs.readFileSync(fileURLToPath(fixtureUrl), 'utf8'));
}

function isPairResult(value: unknown): value is PairResult {
  if (value == null || typeof value !== 'object') {
    return false;
  }

  const pair = (value as { pair?: unknown }).pair;
  return (
    Array.isArray(pair) &&
    pair.length === 2 &&
    typeof pair[0] === 'string' &&
    typeof pair[1] === 'number'
  );
}

function isNormalizedStrictRequest(body: any): boolean {
  const jsonSchema = body.response_format?.json_schema;
  const pairSchema = jsonSchema?.schema?.properties?.pair;
  return (
    body.response_format?.type === 'json_schema' &&
    jsonSchema.strict === true &&
    jsonSchema.description == null &&
    jsonSchema.schema.$schema == null &&
    JSON.stringify(pairSchema) ===
      JSON.stringify(normalizedSchema.properties.pair)
  );
}

async function main() {
  let capturedRequest: unknown;
  const provider = createMoonshotAI({
    apiKey: 'fixture-replay-key',
    fetch: async (_input, init) => {
      capturedRequest =
        typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;

      if (isNormalizedStrictRequest(capturedRequest)) {
        return Response.json(readFixture('accepted'));
      }

      if ((capturedRequest as any)?.response_format?.type === 'json_object') {
        return Response.json(readFixture('json-object'));
      }

      return Response.json(readFixture('rejected'), { status: 400 });
    },
  });

  const result = await generateObject({
    model: provider('kimi-k3'),
    schemaName: 'named_pair',
    schemaDescription: 'A required string-number pair.',
    schema: jsonSchema<PairResult>(schema),
    prompt,
    maxOutputTokens: 256,
    maxRetries: 0,
  });

  if (!isPairResult(result.object)) {
    console.error(
      `Captured AI SDK request: ${JSON.stringify(capturedRequest)}`,
    );
    throw new Error(
      'ISSUE_19544_REPRODUCED: AI SDK Moonshot structured output did not produce the schema-conforming object that Moonshot strict mode produced.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
