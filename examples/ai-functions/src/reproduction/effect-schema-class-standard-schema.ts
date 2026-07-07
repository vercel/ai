import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import 'dotenv/config';
import { Schema } from 'effect';

class BettyReviewResult extends Schema.Class<BettyReviewResult>(
  'BettyReviewResult',
)({
  rating: Schema.Number.pipe(Schema.between(1, 5)),
  summary: Schema.String,
  highlights: Schema.Array(Schema.String),
  recommended: Schema.Boolean,
}) {}

type CaseResult =
  | {
      caseName: string;
      ok: true;
      object: unknown;
    }
  | {
      caseName: string;
      ok: false;
      error: {
        name?: string;
        message?: string;
        statusCode?: number;
        data?: unknown;
        cause?: unknown;
      };
    };

type SerializedError = Extract<CaseResult, { ok: false }>['error'];

function serializeError(error: unknown): SerializedError {
  const value = error as {
    name?: string;
    message?: string;
    statusCode?: number;
    data?: unknown;
    cause?: unknown;
  };

  return {
    name: value.name,
    message: value.message,
    statusCode: value.statusCode,
    data: value.data,
    cause:
      value.cause instanceof Error
        ? { name: value.cause.name, message: value.cause.message }
        : value.cause,
  };
}

async function runCase(caseName: string, schema: unknown): Promise<CaseResult> {
  try {
    const result = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: schema as any,
      prompt:
        "Write a short review for a cozy neighborhood diner called Betty's. Include a 1-5 rating, a one-line summary, three highlights, and whether you recommend it.",
    });

    return { caseName, ok: true, object: result.object };
  } catch (error) {
    return { caseName, ok: false, error: serializeError(error) };
  }
}

async function main() {
  const classDirectSchema = Schema.standardSchemaV1(BettyReviewResult);
  const structFieldsSchema = Schema.standardSchemaV1(
    Schema.Struct(BettyReviewResult.fields),
  );

  const standardMetadata = {
    classDirectHasJsonSchema:
      (classDirectSchema as any)['~standard'].jsonSchema != null,
    structFieldsHasJsonSchema:
      (structFieldsSchema as any)['~standard'].jsonSchema != null,
    classDirectVendor: (classDirectSchema as any)['~standard'].vendor,
    structFieldsVendor: (structFieldsSchema as any)['~standard'].vendor,
  };

  const [classDirect, structFields] = await Promise.all([
    runCase('Schema.standardSchemaV1(BettyReviewResult)', classDirectSchema),
    runCase(
      'Schema.standardSchemaV1(Schema.Struct(BettyReviewResult.fields))',
      structFieldsSchema,
    ),
  ]);

  const issueReproduced =
    !classDirect.ok &&
    classDirect.error.statusCode === 400 &&
    structFields.ok === true;

  console.log(
    JSON.stringify(
      {
        standardMetadata,
        results: [classDirect, structFields],
        issueReproduced,
      },
      null,
      2,
    ),
  );

  if (issueReproduced) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
