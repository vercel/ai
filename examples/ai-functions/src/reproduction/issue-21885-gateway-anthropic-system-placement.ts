const placementError =
  "role 'system' must follow a 'user' message or an 'assistant' message ending in a server tool result";

type GatewayResponse = {
  status?: string;
  error?: { message?: string };
  output?: Array<{
    type?: string;
    content?: Array<{ text?: string }>;
  }>;
};

async function request({
  endpoint,
  normalized,
  key,
}: {
  endpoint: '/codex/v1/responses' | '/v1/responses';
  normalized: boolean;
  key: string;
}) {
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
  const body = (await response.json()) as GatewayResponse;
  const output = body.output
    ?.filter(item => item.type === 'message')
    .flatMap(item => item.content ?? [])
    .map(item => item.text)
    .filter((text): text is string => text != null);

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

  return { http: response.status, body, output };
}

async function main() {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) {
    throw new Error('AI_GATEWAY_API_KEY is required');
  }

  const original = await request({
    endpoint: '/codex/v1/responses',
    normalized: false,
    key,
  });

  if (
    original.http === 400 &&
    original.body.error?.message?.includes(placementError)
  ) {
    throw new Error(
      'ISSUE 21885 REPRODUCED: original ordering returned the Anthropic system-message placement error',
    );
  }

  if (
    original.http !== 200 ||
    original.body.status !== 'completed' ||
    !original.output?.some(text => text.includes('OK'))
  ) {
    throw new Error(
      `Unexpected original-ordering result: HTTP ${original.http}, status ${String(original.body.status)}, error ${String(original.body.error?.message)}`,
    );
  }

  const normalized = await request({
    endpoint: '/codex/v1/responses',
    normalized: true,
    key,
  });
  if (
    normalized.http !== 200 ||
    normalized.body.status !== 'completed' ||
    !normalized.output?.some(text => text.includes('OK'))
  ) {
    throw new Error(
      `Diagnostic control failed: HTTP ${normalized.http}, status ${String(normalized.body.status)}, error ${String(normalized.body.error?.message)}`,
    );
  }

  const standardEndpoint = await request({
    endpoint: '/v1/responses',
    normalized: false,
    key,
  });
  if (
    standardEndpoint.http !== 200 ||
    standardEndpoint.body.status !== 'completed' ||
    !standardEndpoint.output?.some(text => text.includes('OK'))
  ) {
    throw new Error(
      `Standard Responses endpoint failed: HTTP ${standardEndpoint.http}, status ${String(standardEndpoint.body.status)}, error ${String(standardEndpoint.body.error?.message)}`,
    );
  }

  console.log(
    'Issue 21885 was not reproduced: all public-model requests completed with output OK.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
