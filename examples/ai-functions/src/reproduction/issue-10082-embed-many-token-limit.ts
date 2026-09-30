import { createOpenAI } from '@ai-sdk/openai';
import { parseJSON } from '@ai-sdk/provider-utils';
import { APICallError, embedMany } from 'ai';

const valueCount = 2178;
const value = 'token '.repeat(400).trim();
const maxInputBytesPerCall = 300_000;
const expectedAggregateLimitErrorCode = 'max_tokens_per_request';
const textEncoder = new TextEncoder();

type OpenAIErrorData = {
  error?: {
    code?: unknown;
  };
};

async function main() {
  const requests: Array<{ valueCount: number; inputBytes: number }> = [];

  const openai = createOpenAI({
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        const body = (await parseJSON({ text: init.body })) as {
          input?: unknown;
        };

        if (Array.isArray(body.input)) {
          const inputValues = body.input.filter(
            (value): value is string => typeof value === 'string',
          );

          requests.push({
            valueCount: inputValues.length,
            inputBytes: inputValues.reduce(
              (total, value) => total + textEncoder.encode(value).length,
              0,
            ),
          });
        }
      }

      return fetch(input, init);
    },
  });

  const values = Array.from({ length: valueCount }, () => value);

  try {
    const result = await embedMany({
      model: openai.embedding('text-embedding-3-small'),
      values,
      maxParallelCalls: 4,
    });

    if (result.embeddings.length !== values.length) {
      throw new Error(
        `Expected ${values.length} embeddings, received ${result.embeddings.length}.`,
      );
    }

    const oversizedRequest = requests.find(
      request => request.inputBytes > maxInputBytesPerCall,
    );

    if (oversizedRequest != null) {
      throw new Error(
        `Expected requests to stay within ${maxInputBytesPerCall} input bytes, received ${oversizedRequest.inputBytes}.`,
      );
    }

    console.log(
      JSON.stringify(
        {
          valueCount: values.length,
          valueCharacters: value.length,
          requests,
          embeddingCount: result.embeddings.length,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (
      !APICallError.isInstance(error) ||
      error.statusCode !== 400 ||
      (error.data as OpenAIErrorData | undefined)?.error?.code !==
        expectedAggregateLimitErrorCode
    ) {
      throw error;
    }

    console.log(
      JSON.stringify(
        {
          valueCount: values.length,
          valueCharacters: value.length,
          requests,
          statusCode: error.statusCode,
          message: error.message,
          responseBody: error.responseBody,
        },
        null,
        2,
      ),
    );

    throw new Error(
      'Reproduced issue #10082: embedMany sent a request above the OpenAI 300,000-token aggregate limit instead of splitting it into smaller requests.',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
