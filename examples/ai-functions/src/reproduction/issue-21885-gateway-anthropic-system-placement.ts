type GatewayResult = {
  http: number;
  status?: string;
  error?: string;
  output: string[];
};

const model = 'anthropic/claude-opus-5.5-fast';
const placementError =
  "role 'system' must follow a 'user' message or an 'assistant' message ending in a server tool result";

async function request({
  endpoint,
  normalized,
}: {
  endpoint: '/codex/v1/responses' | '/v1/responses';
  normalized: boolean;
}): Promise<GatewayResult> {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) {
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
      model,
      instructions: 'Reply OK.',
      input,
      max_output_tokens: 1024,
      stream: false,
    }),
  });
  const body = (await response.json()) as {
    status?: string;
    error?: { message?: string };
    output?: Array<{
      type?: string;
      content?: Array<{ text?: string }>;
    }>;
  };

  return {
    http: response.status,
    status: body.status,
    error: body.error?.message,
    output:
      body.output
        ?.filter(item => item.type === 'message')
        .flatMap(item => item.content ?? [])
        .flatMap(item => (item.text == null ? [] : [item.text])) ?? [],
  };
}

function assertCompleted(label: string, result: GatewayResult): void {
  if (
    result.http !== 200 ||
    result.status !== 'completed' ||
    !result.output.some(text => text.trim() === 'OK')
  ) {
    if (result.error?.includes(placementError)) {
      throw new Error(
        `Issue #21885 reproduced: ${label} failed with Anthropic system-message placement error`,
      );
    }

    throw new Error(
      `${label} did not complete with output OK: ${JSON.stringify(result)}`,
    );
  }
}

async function main(): Promise<void> {
  const cases = [
    {
      label: 'reported Codex ordering',
      endpoint: '/codex/v1/responses' as const,
      normalized: false,
    },
    {
      label: 'reordered Codex control',
      endpoint: '/codex/v1/responses' as const,
      normalized: true,
    },
    {
      label: 'reported ordering through OpenResponses',
      endpoint: '/v1/responses' as const,
      normalized: false,
    },
  ];

  for (const testCase of cases) {
    const result = await request(testCase);
    console.log(JSON.stringify({ case: testCase.label, ...result }));
    assertCompleted(testCase.label, result);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
