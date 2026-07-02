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

const prompt =
  "Write a short review for a cozy neighborhood diner called Betty's. Return a rating, summary, highlights, and whether you recommend it.";

async function runCase(name: string, schema: unknown) {
  const jsonSchema = (schema as any)['~standard'].jsonSchema?.input?.({
    target: 'draft-07',
  });
  console.log(`\n--- ${name} JSON Schema exposed by Standard Schema ---`);
  console.log(JSON.stringify(jsonSchema ?? null, null, 2));

  console.log(`\n--- Running ${name} generateObject call ---`);
  const result = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: schema as never,
    prompt,
  });
  console.log(`${name} object:`, result.object);
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY is required to reproduce vercel/ai issue #15155.',
    );
  }

  // Control case from the issue: wrapping class fields in Schema.Struct succeeds.
  await runCase(
    'Schema.Struct(BettyReviewResult.fields)',
    Schema.standardSchemaV1(Schema.Struct(BettyReviewResult.fields)),
  );

  // Reported failing case: direct Standard Schema view of Schema.Class reaches
  // OpenAI as a different JSON Schema and is rejected with HTTP 400.
  await runCase(
    'Schema.standardSchemaV1(BettyReviewResult)',
    Schema.standardSchemaV1(BettyReviewResult),
  );
}

main().catch(error => {
  console.error('\nissue-15155 reproduction failed:');
  console.error(error);
  process.exitCode = 1;
});
