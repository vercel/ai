import 'dotenv/config';

import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { Schema } from 'effect';

class BettyReviewResult extends Schema.Class<BettyReviewResult>(
  'BettyReviewResult',
)({
  rating: Schema.Number.pipe(Schema.between(1, 5)),
  summary: Schema.String,
  highlights: Schema.Array(Schema.String),
  recommended: Schema.Boolean,
}) {}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (
    typeof input === 'string' &&
    input.includes('api.openai.com') &&
    typeof init?.body === 'string'
  ) {
    const body = JSON.parse(init.body);
    console.log(
      '\nOpenAI structured-output request fields sent by AI SDK:\n',
      JSON.stringify(
        {
          response_format: body.response_format,
          tools: body.tools,
          tool_choice: body.tool_choice,
          functions: body.functions,
          function_call: body.function_call,
        },
        null,
        2,
      ),
    );
  }

  return originalFetch(input, init);
};

async function runCase(name: string, schema: unknown) {
  console.log(`\n=== ${name} ===`);
  const result = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: schema as never,
    prompt:
      "Write a short review for a cozy neighborhood diner called Betty's. Include a 1-5 rating, a one-line summary, three highlights, and whether you recommend it.",
  });

  console.log(`${name} succeeded with object:`);
  console.log(JSON.stringify(result.object, null, 2));
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    'OPENAI_API_KEY is required to reproduce vercel/ai issue #15155.',
  );
}

await runCase(
  'Schema.standardSchemaV1(Schema.Struct(BettyReviewResult.fields))',
  Schema.standardSchemaV1(Schema.Struct(BettyReviewResult.fields)),
);

await runCase(
  'Schema.standardSchemaV1(BettyReviewResult)',
  Schema.standardSchemaV1(BettyReviewResult),
);
