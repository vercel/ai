import assert from 'node:assert/strict';

type ResponseBody = {
  status?: string;
  error?: { message?: string };
  output?: Array<{
    type?: string;
    content?: Array<{ text?: string }>;
  }>;
};

class ReportedPlacementError extends Error {}

const placementError =
  "role 'system' must follow a 'user' message or an 'assistant' message ending in a server tool result";

async function request({
  endpoint,
  normalized,
}: {
  endpoint: '/codex/v1/responses' | '/v1/responses';
  normalized: boolean;
}) {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (key == null) {
    throw new Error('AI_GATEWAY_API_KEY is required');
  }

  const user = { role: 'user', content: 'Continue.' };
  const developer = {
    role: 'developer',
    content: 'Additional instruction: reply OK.',
  };
  const input = [
    { role: 'user', content: 'Hello.' },
    { role: 'assistant', content: 'OK' },
    ...(normalized ? [user, developer] : [developer, user]),
  ];

  const response = await fetch(`https://ai-gateway.vercel.sh${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-opus-5.5-fast',
      instructions: 'Reply OK.',
      input,
      max_output_tokens: 1024,
      stream: false,
    }),
  });
  const body = (await response.json()) as ResponseBody;
  const output = body.output
    ?.filter(item => item.type === 'message')
    .flatMap(item => item.content ?? [])
    .map(item => item.text);

  console.log(
    JSON.stringify({
      endpoint,
      normalized,
      http: response.status,
      status: body.status,
      error: body.error?.message,
      output,
    }),
  );

  if (
    response.status === 400 &&
    body.error?.message?.includes(placementError)
  ) {
    throw new ReportedPlacementError(
      `ISSUE_21885: ${endpoint} rejected the developer instruction after the assistant message: ${body.error.message}`,
    );
  }

  assert.equal(response.status, 200, `${endpoint}: unexpected HTTP status`);
  assert.equal(
    body.status,
    'completed',
    `${endpoint}: response did not finish`,
  );
  assert.deepEqual(output, ['OK'], `${endpoint}: unexpected model output`);
}

async function main() {
  await request({ endpoint: '/codex/v1/responses', normalized: false });
  await request({ endpoint: '/codex/v1/responses', normalized: true });
  await request({ endpoint: '/v1/responses', normalized: false });
  console.log('Issue #21885 did not reproduce.');
}

main().catch(error => {
  if (error instanceof ReportedPlacementError) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
