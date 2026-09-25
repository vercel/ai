import { createOpenResponses } from '@ai-sdk/open-responses';
import { Output, streamText } from 'ai';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const fixtureDirectory = path.resolve(
  process.cwd(),
  '../../packages/open-responses/src/responses/__fixtures__',
);

const errorFixture = fs.readFileSync(
  path.join(fixtureDirectory, 'openai-schema-less-json-error.1.json'),
  'utf8',
);

const successFixture = fs
  .readFileSync(
    path.join(fixtureDirectory, 'openai-schema-less-json.1.chunks.txt'),
    'utf8',
  )
  .split('\n')
  .filter(line => line.length > 0)
  .map(line => `data: ${line}\n\n`)
  .concat('data: [DONE]\n\n')
  .join('');

async function main() {
  let providerRejection: string | undefined;

  const provider = createOpenResponses({
    name: 'openai',
    url: 'https://api.openai.com/v1/responses',
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        text?: {
          format?: {
            type?: string;
            name?: string;
            schema?: unknown;
          };
        };
      };

      const format = body.text?.format;

      if (
        format?.type === 'json_schema' &&
        (format.name == null || format.schema == null)
      ) {
        providerRejection = JSON.parse(errorFixture).error.message;

        return new Response(errorFixture, {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (format?.type !== 'json_object') {
        return new Response(
          JSON.stringify({
            error: {
              message: `Unexpected text.format: ${JSON.stringify(format)}`,
            },
          }),
          {
            status: 400,
            headers: { 'content-type': 'application/json' },
          },
        );
      }

      return new Response(successFixture, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    },
  });

  const result = streamText({
    model: provider('gpt-4o-mini'),
    prompt: 'Return {"ok": true} as JSON.',
    output: Output.json(),
  });

  try {
    assert.deepEqual(await result.output, { ok: true });
  } catch (error) {
    if (providerRejection != null) {
      throw new Error(
        `ISSUE_21202_REPRODUCED: schema-less Output.json() was rejected before model execution: ${providerRejection}`,
        { cause: error },
      );
    }

    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
