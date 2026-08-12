import 'dotenv/config';
import {
  openai,
  type OpenAILanguageModelResponsesOptions,
} from '@ai-sdk/openai';
import {
  APICallError,
  generateObject,
  generateText,
  jsonSchema,
  Output,
  streamObject,
  streamText,
} from 'ai';
import type { JSONSchema7 } from '@ai-sdk/provider';

type SharedElement = {
  shared: string;
};

const providerOptions = {
  openai: {
    strictJsonSchema: true,
  } satisfies OpenAILanguageModelResponsesOptions,
};

function createElementSchema(keyword: 'definitions' | '$defs') {
  const reference =
    keyword === 'definitions' ? '#/definitions/Shared' : '#/$defs/Shared';

  return jsonSchema<SharedElement>({
    type: 'object',
    properties: {
      shared: { $ref: reference },
    },
    required: ['shared'],
    additionalProperties: false,
    [keyword]: {
      Shared: {
        type: 'string',
        enum: ['works'],
      },
    },
  } as JSONSchema7);
}

function isMissingRootDefinitionError(
  error: unknown,
): error is InstanceType<typeof APICallError> {
  return (
    APICallError.isInstance(error) &&
    error.statusCode === 400 &&
    error.message.toLowerCase().includes('reference to component') &&
    error.message.includes('Shared') &&
    error.message.toLowerCase().includes('was not found in the schema') &&
    error.message.includes("'properties', 'elements', 'items'")
  );
}

function assertOutput(output: SharedElement[]) {
  if (output.length !== 1 || output[0]?.shared !== 'works') {
    throw new Error(`Unexpected successful output: ${JSON.stringify(output)}`);
  }
}

async function runCase(
  name: string,
  operation: () => Promise<SharedElement[]>,
) {
  try {
    assertOutput(await operation());
    return false;
  } catch (error) {
    if (isMissingRootDefinitionError(error)) {
      console.error(`${name}: ${error.message}`);
      return true;
    }

    throw new Error(`${name} failed unexpectedly`, { cause: error });
  }
}

async function main() {
  const failures: string[] = [];

  if (
    await runCase('generateText + Output.array + $defs', async () => {
      const result = await generateText({
        model: openai('gpt-4o-mini'),
        providerOptions,
        output: Output.array({
          element: createElementSchema('$defs'),
        }),
        prompt: 'Return one element whose shared value is "works".',
      });
      return result.output;
    })
  ) {
    failures.push('generateText + Output.array + $defs');
  }

  if (
    await runCase('streamText + Output.array + definitions', async () => {
      let streamError: unknown;
      const result = streamText({
        model: openai('gpt-4o-mini'),
        providerOptions,
        output: Output.array({
          element: createElementSchema('definitions'),
        }),
        prompt: 'Return one element whose shared value is "works".',
        onError: ({ error }) => {
          streamError = error;
        },
      });
      try {
        return await result.output;
      } catch (error) {
        throw streamError ?? error;
      }
    })
  ) {
    failures.push('streamText + Output.array + definitions');
  }

  if (
    await runCase('generateObject array + definitions', async () => {
      const result = await generateObject({
        model: openai('gpt-4o-mini'),
        providerOptions,
        output: 'array',
        schema: createElementSchema('definitions'),
        prompt: 'Return one element whose shared value is "works".',
      });
      return result.object;
    })
  ) {
    failures.push('generateObject array + definitions');
  }

  if (
    await runCase('streamObject array + $defs', async () => {
      let streamError: unknown;
      const result = streamObject({
        model: openai('gpt-4o-mini'),
        providerOptions,
        output: 'array',
        schema: createElementSchema('$defs'),
        prompt: 'Return one element whose shared value is "works".',
        onError: ({ error }) => {
          streamError = error;
        },
      });
      try {
        for await (const _partial of result.partialObjectStream) {
          // Consume the stream so the terminal object promise is settled.
        }
        if (streamError != null) {
          throw streamError;
        }
        return await result.object;
      } catch (error) {
        throw streamError ?? error;
      }
    })
  ) {
    failures.push('streamObject array + $defs');
  }

  if (failures.length > 0) {
    console.error(
      'ISSUE_6454_REPRODUCED: OpenAI rejected array output schemas because root definitions were nested under items',
    );
    console.error(`Affected paths: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
