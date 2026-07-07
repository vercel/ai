import { generateObject } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
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
      ok: true;
      object: unknown;
      modelCallCount: number;
      responseFormat: unknown;
    }
  | {
      ok: false;
      error: SerializedError;
      modelCallCount: number;
      responseFormat: unknown;
    };

type SerializedError = {
  name: string;
  message: string;
  cause?: unknown;
};

const expectedObject = {
  rating: 5,
  summary: 'A cozy neighborhood diner with friendly service.',
  highlights: ['friendly staff', 'comfort food'],
  recommended: true,
};

function inspectStandardSchema(schema: unknown) {
  const standard = (schema as { '~standard'?: Record<string, unknown> })[
    '~standard'
  ];
  const jsonSchema = standard?.jsonSchema as
    | { input?: unknown; output?: unknown }
    | undefined;

  return {
    vendor: standard?.vendor,
    version: standard?.version,
    hasJsonSchema: jsonSchema != null,
    hasJsonSchemaInput: typeof jsonSchema?.input === 'function',
    hasJsonSchemaOutput: typeof jsonSchema?.output === 'function',
  };
}

function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      cause: error.cause,
    };
  }

  return {
    name: typeof error,
    message: String(error),
  };
}

async function runCase({
  label,
  schema,
}: {
  label: string;
  schema: unknown;
}): Promise<{ label: string; standardSchema: unknown; result: CaseResult }> {
  const model = new MockLanguageModelV3({
    doGenerate: {
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: {
          total: 10,
          noCache: 10,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: 20,
          text: 20,
          reasoning: undefined,
        },
      },
      response: { id: 'id-1', timestamp: new Date(123), modelId: 'm-1' },
      warnings: [],
      content: [{ type: 'text', text: JSON.stringify(expectedObject) }],
    },
  });

  try {
    const result = await generateObject({
      model,
      schema: schema as any,
      prompt:
        "Write a short review for a cozy neighborhood diner called Betty's.",
    });

    return {
      label,
      standardSchema: inspectStandardSchema(schema),
      result: {
        ok: true,
        object: result.object,
        modelCallCount: model.doGenerateCalls.length,
        responseFormat: model.doGenerateCalls[0]?.responseFormat,
      },
    };
  } catch (error) {
    return {
      label,
      standardSchema: inspectStandardSchema(schema),
      result: {
        ok: false,
        error: serializeError(error),
        modelCallCount: model.doGenerateCalls.length,
        responseFormat: model.doGenerateCalls[0]?.responseFormat,
      },
    };
  }
}

async function main() {
  const classDirect = Schema.standardSchemaV1(BettyReviewResult);
  const structWrapped = Schema.standardSchemaV1(
    Schema.Struct(BettyReviewResult.fields),
  );

  const results = await Promise.all([
    runCase({ label: 'Schema.Class direct', schema: classDirect }),
    runCase({ label: 'Schema.Struct(Class.fields)', schema: structWrapped }),
  ]);

  const classResult = results[0].result;
  const structResult = results[1].result;

  console.log(
    JSON.stringify(
      {
        classification: 'general library behavior',
        issueReproduced: !classResult.ok && structResult.ok,
        expectedIssueBehavior:
          'Schema.Class direct should fail with an OpenAI HTTP 400 while Schema.Struct(Class.fields) should return a valid object.',
        observedBehavior:
          !classResult.ok && !structResult.ok
            ? 'Both schemas failed before the language model was called.'
            : 'Observed behavior differed from the reported failure/success split.',
        results,
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
