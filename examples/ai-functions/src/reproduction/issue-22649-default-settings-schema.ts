import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import type {
  JSONSchema7,
  LanguageModelV4,
  LanguageModelV4CallOptions,
} from '@ai-sdk/provider';
import {
  defaultSettingsMiddleware,
  generateText,
  jsonSchema,
  Output,
  wrapLanguageModel,
} from 'ai';

const requestedSchema = {
  type: 'object',
  properties: {
    value: { type: 'number' },
  },
  required: ['value'],
  additionalProperties: false,
} satisfies JSONSchema7;

const defaultSchema = {
  type: 'object',
  properties: {
    value: {
      type: 'string',
      enum: ['ready'],
      const: 'ready',
    },
  },
  required: ['value'],
  additionalProperties: false,
} satisfies JSONSchema7;

const defaultResponseFormat = {
  type: 'json',
  schema: defaultSchema,
} satisfies LanguageModelV4CallOptions['responseFormat'];

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: 0,
  },
};

async function main() {
  const receivedOptions: LanguageModelV4CallOptions[] = [];
  let callCount = 0;

  const baseModel: LanguageModelV4 = {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock',
    supportedUrls: {},
    async doGenerate(options) {
      receivedOptions.push(options);
      callCount++;

      return {
        content: [
          {
            type: 'text',
            text: callCount === 1 ? '{"value":7}' : 'plain text',
          },
        ],
        warnings: [],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
      };
    },
    async doStream() {
      throw new Error('Streaming is not used by this reproduction.');
    },
  };

  const middleware = defaultSettingsMiddleware({
    settings: {
      responseFormat: defaultResponseFormat,
      providerOptions: {
        mock: {
          defaults: {
            retained: true,
          },
        },
      },
    },
  });

  const model = wrapLanguageModel({
    model: baseModel,
    middleware,
  });

  const objectResult = await generateText({
    model,
    prompt: 'Return a number.',
    output: Output.object({
      schema: jsonSchema<{ value: number }>(requestedSchema),
    }),
    providerOptions: {
      mock: {
        call: {
          retained: true,
        },
      },
    },
  });

  await generateText({
    model,
    prompt: 'Return plain text.',
    output: Output.text(),
  });

  const paramsWithoutResponseFormat = await middleware.transformParams!({
    type: 'generate',
    model: baseModel,
    params: {
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Use the default format.' }],
        },
      ],
    },
  });

  assert.deepEqual(
    objectResult.output,
    { value: 7 },
    'The SDK should validate the generated value against the caller schema.',
  );
  assert.deepEqual(
    paramsWithoutResponseFormat.responseFormat,
    defaultResponseFormat,
    'The default response format should still apply when the call omits one.',
  );
  assert.deepEqual(
    receivedOptions[0].providerOptions,
    {
      mock: {
        defaults: {
          retained: true,
        },
        call: {
          retained: true,
        },
      },
    },
    'Provider options should retain their intended deep-merge behavior.',
  );

  const expectedObjectFormat = {
    type: 'json',
    schema: requestedSchema,
  };
  const expectedTextFormat = { type: 'text' };

  const objectFormatWasReplaced = isDeepStrictEqual(
    receivedOptions[0].responseFormat,
    expectedObjectFormat,
  );
  const textFormatWasReplaced = isDeepStrictEqual(
    receivedOptions[1].responseFormat,
    expectedTextFormat,
  );

  if (!objectFormatWasReplaced || !textFormatWasReplaced) {
    console.error(
      'ISSUE_22649_REPRODUCED: explicit per-call responseFormat was merged with incompatible defaults instead of replacing them',
    );
    console.error(
      JSON.stringify(
        {
          requestedObjectFormat: expectedObjectFormat,
          receivedObjectFormat: receivedOptions[0].responseFormat,
          requestedTextFormat: expectedTextFormat,
          receivedTextFormat: receivedOptions[1].responseFormat,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
