import { createOpenResponses } from '@ai-sdk/open-responses';
import { APICallError, Output, streamText } from 'ai';
import { readFile } from 'node:fs/promises';

const fixtureUrl = (name: string) =>
  new URL(
    `../../../../packages/open-responses/src/responses/__fixtures__/${name}`,
    import.meta.url,
  );

async function main() {
  const [errorFixture, successChunks] = await Promise.all([
    readFile(fixtureUrl('openai-schema-less-json-error.1.json'), 'utf8').then(
      JSON.parse,
    ),
    readFile(fixtureUrl('openai-schema-less-json-object.1.chunks.txt'), 'utf8'),
  ]);

  const provider = createOpenResponses({
    name: 'openai',
    url: 'https://api.openai.com/v1/responses',
    fetch: async (_input, init) => {
      const requestBody = JSON.parse(String(init?.body));
      const isValidSchemaLessJsonRequest =
        requestBody.text?.format?.type === 'json_object';

      return isValidSchemaLessJsonRequest
        ? new Response(successChunks, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          })
        : Response.json(errorFixture, { status: 400 });
    },
  });

  let streamError: unknown;
  let text = '';
  const result = streamText({
    model: provider('gpt-4o-mini'),
    prompt: 'Return {"ok":true} as JSON.',
    output: Output.json(),
    onError: ({ error }) => {
      streamError = error;
    },
  });

  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') {
      text += part.text;
    }
  }

  if (
    APICallError.isInstance(streamError) &&
    streamError.statusCode === 400 &&
    streamError.message === "Missing required parameter: 'text.format.name'."
  ) {
    console.error(
      `Schema-less JSON request was rejected: ${streamError.message}`,
    );
    process.exitCode = 1;
    return;
  }

  if (streamError != null) {
    throw streamError;
  }

  const output = JSON.parse(text);
  if (JSON.stringify(output) !== '{"ok":true}') {
    throw new Error(
      `Schema-less JSON returned an unexpected output: ${JSON.stringify(output)}`,
    );
  }
}

main();
