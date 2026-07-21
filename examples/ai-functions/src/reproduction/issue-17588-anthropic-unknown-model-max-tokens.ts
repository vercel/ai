import { createAnthropic } from '../../../../packages/anthropic/src';
import { generateText } from '../../../../packages/ai/src/generate-text';

type RequestBody = {
  max_tokens?: number;
  model?: string;
};

function createResponse(model: string): Response {
  return new Response(
    JSON.stringify({
      id: 'msg_issue_17588',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'ok' }],
      model,
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 1,
        output_tokens: 1,
      },
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    },
  );
}

async function runCall(maxOutputTokens?: number) {
  const requestBodies: RequestBody[] = [];
  const modelId = 'claude-fable-6';
  const anthropic = createAnthropic({
    apiKey: 'test-api-key',
    fetch: async (_input, init) => {
      requestBodies.push(JSON.parse(String(init?.body)) as RequestBody);
      return createResponse(modelId);
    },
  });

  const result = await generateText({
    model: anthropic(modelId),
    messages: [{ role: 'user', content: '' }],
    maxOutputTokens,
  });

  if (requestBodies.length !== 1) {
    throw new Error(`Expected one request, received ${requestBodies.length}.`);
  }

  return {
    body: requestBodies[0],
    warnings: result.warnings ?? [],
  };
}

async function main() {
  const implicit = await runCall();
  const explicit = await runCall(8192);

  console.log(
    JSON.stringify(
      {
        implicit,
        explicit,
      },
      null,
      2,
    ),
  );

  if (explicit.body.max_tokens !== 8192) {
    throw new Error(
      `Expected explicit maxOutputTokens=8192 to send max_tokens=8192, received ${String(explicit.body.max_tokens)}.`,
    );
  }

  if (implicit.body.max_tokens === 4096 && implicit.warnings.length === 0) {
    throw new Error(
      'Issue #17588 reproduced: unknown Anthropic model silently received max_tokens=4096',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
