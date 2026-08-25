import {
  createMoonshotAI,
  type MoonshotAILanguageModelOptions,
} from '@ai-sdk/moonshotai';
import { APICallError, type JSONSchema7 } from '@ai-sdk/provider';
import { generateText, jsonSchema, Output } from 'ai';

type TupleOutput = {
  pair: [string, number];
};

const schema: JSONSchema7 = {
  type: 'object',
  properties: {
    pair: {
      type: 'array',
      items: [{ type: 'string' }, { type: 'number' }],
    },
  },
  required: ['pair'],
  additionalProperties: false,
};

const normalizedSchema = {
  type: 'object',
  properties: {
    pair: {
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'number' }],
    },
  },
  required: ['pair'],
  additionalProperties: false,
} as const;

const strictOptOut = {
  strictJsonSchema: false,
} satisfies MoonshotAILanguageModelOptions;

async function callMoonshotDirectly() {
  const response = await fetch('https://api.moonshot.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.MOONSHOT_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'kimi-k3',
      max_tokens: 64,
      messages: [
        {
          role: 'user',
          content: 'Return a JSON object with pair equal to ["age", 42].',
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'tuple_response',
          strict: true,
          schema: normalizedSchema,
        },
      },
    }),
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `Direct normalized Moonshot request failed with HTTP ${response.status}: ${body}`,
    );
  }

  return JSON.parse(body) as {
    choices: Array<{ message: { content: string } }>;
  };
}

async function verifySecondaryRequestShapes() {
  const requests: unknown[] = [];
  const mockResponse = {
    id: 'chatcmpl-issue-19544',
    object: 'chat.completion',
    created: 0,
    model: 'kimi-k3',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: '{"pair":["age",42]}',
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 1,
      completion_tokens: 1,
      total_tokens: 2,
    },
  };

  const moonshot = createMoonshotAI({
    apiKey: 'test-api-key',
    fetch: async (_input, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  await moonshot('kimi-k3').doGenerate({
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    responseFormat: {
      type: 'json',
      name: 'tuple_response',
      description: 'A named pair.',
      schema,
    },
    providerOptions: {
      moonshotai: strictOptOut,
    },
  });

  await moonshot('moonshot-v1-8k').doGenerate({
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    responseFormat: {
      type: 'json',
      schema,
    },
    providerOptions: {
      moonshotai: strictOptOut,
    },
  });

  const strictOptOutRequest = requests[0] as {
    response_format?: {
      json_schema?: Record<string, unknown>;
    };
  };
  const fallbackRequest = requests[1] as {
    response_format?: Record<string, unknown>;
  };

  const expectedStrictPayload = {
    name: 'tuple_response',
    strict: false,
    schema: normalizedSchema,
  };

  if (
    JSON.stringify(strictOptOutRequest.response_format?.json_schema) !==
    JSON.stringify(expectedStrictPayload)
  ) {
    throw new Error(
      `Moonshot strict opt-out request mismatch: ${JSON.stringify(strictOptOutRequest.response_format)}`,
    );
  }

  if (
    JSON.stringify(fallbackRequest.response_format) !==
    JSON.stringify({ type: 'json_object' })
  ) {
    throw new Error(
      `Moonshot JSON-object fallback changed: ${JSON.stringify(fallbackRequest.response_format)}`,
    );
  }
}

async function main() {
  const directResult = await callMoonshotDirectly();
  let aiSdkRequest: unknown;

  const moonshot = createMoonshotAI({
    fetch: async (input, init) => {
      aiSdkRequest = JSON.parse(String(init?.body));
      return fetch(input, init);
    },
  });

  try {
    const result = await generateText({
      model: moonshot('kimi-k3'),
      maxOutputTokens: 64,
      maxRetries: 0,
      output: Output.object({
        name: 'tuple_response',
        description: 'A named pair.',
        schema: jsonSchema<TupleOutput>(schema),
      }),
      prompt: 'Return a JSON object with pair equal to ["age", 42].',
    });

    if (result.output.pair[0] !== 'age' || result.output.pair[1] !== 42) {
      throw new Error(
        `Moonshot returned an unexpected structured output: ${JSON.stringify(result.output)}`,
      );
    }
  } catch (error) {
    if (
      APICallError.isInstance(error) &&
      error.statusCode === 400 &&
      error.message.includes('properties.pair.items') &&
      error.message.includes('items must be an object')
    ) {
      console.error(
        'Reproduced issue #19544: Moonshot rejected the AI SDK structured-output tuple schema even though the equivalent MFJS-normalized request succeeded.',
      );
      console.error(
        JSON.stringify(
          {
            directProviderOutput:
              directResult.choices[0]?.message.content ?? null,
            aiSdkRequest,
            providerError: error.message,
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
      return;
    }

    throw error;
  }

  await verifySecondaryRequestShapes();

  console.log(
    'Moonshot accepted the AI SDK structured output, strict defaults and opt-out were emitted, and JSON-object fallback remained unchanged.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
