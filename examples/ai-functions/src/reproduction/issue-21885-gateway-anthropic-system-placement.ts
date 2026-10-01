const apiKey = process.env.AI_GATEWAY_API_KEY;

if (apiKey == null) {
  throw new Error('AI_GATEWAY_API_KEY is required');
}

const placementError =
  "role 'system' must follow a 'user' message or an 'assistant' message ending in a server tool result";

type ResponseBody = {
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
}: {
  endpoint: '/codex/v1/responses' | '/v1/responses';
  normalized: boolean;
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
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-opus-5.5-fast',
      instructions: 'Reply OK.',
      input,
      max_output_tokens: 1024,
      stream: false,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await response.json()) as ResponseBody;
  const output = body.output
    ?.filter(item => item.type === 'message')
    .flatMap(item => item.content ?? [])
    .map(item => item.text)
    .filter((text): text is string => text != null);
  const result = {
    endpoint,
    normalized,
    http: response.status,
    status: body.status,
    error: body.error?.message,
    output,
  };

  console.log(JSON.stringify(result));
  return result;
}

async function main() {
  const original = await request({
    endpoint: '/codex/v1/responses',
    normalized: false,
  });

  if (original.http === 400 && original.error?.includes(placementError)) {
    throw new Error(
      'Issue #21885 reproduced: the original Codex continuation failed with the Anthropic system-message placement error',
    );
  }
  if (
    original.http !== 200 ||
    original.status !== 'completed' ||
    !original.output?.some(text => text.includes('OK'))
  ) {
    throw new Error(
      `Original Codex continuation did not complete successfully: ${JSON.stringify(original)}`,
    );
  }

  const normalizedControl = await request({
    endpoint: '/codex/v1/responses',
    normalized: true,
  });
  if (
    normalizedControl.http !== 200 ||
    normalizedControl.status !== 'completed' ||
    !normalizedControl.output?.some(text => text.includes('OK'))
  ) {
    throw new Error(
      `Normalized Codex control did not complete successfully: ${JSON.stringify(normalizedControl)}`,
    );
  }

  const responsesControl = await request({
    endpoint: '/v1/responses',
    normalized: false,
  });
  if (
    responsesControl.http !== 200 ||
    responsesControl.status !== 'completed' ||
    !responsesControl.output?.some(text => text.includes('OK'))
  ) {
    throw new Error(
      `Responses API control did not complete successfully: ${JSON.stringify(responsesControl)}`,
    );
  }
}

main();
