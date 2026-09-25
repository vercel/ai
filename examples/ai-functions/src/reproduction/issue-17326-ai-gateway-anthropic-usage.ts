type Usage = {
  input_tokens?: number;
  output_tokens?: number;
};

type StreamObservation = {
  model: string;
  startUsage: Usage;
  finalUsage: Usage;
};

const gatewayBaseUrl = 'https://ai-gateway.vercel.sh';

function parseSseData(body: string): Array<Record<string, unknown>> {
  return body
    .split('\n')
    .filter(line => line.startsWith('data: '))
    .map(line => JSON.parse(line.slice('data: '.length)));
}

function readUsage(value: unknown, location: string): Usage {
  if (value == null || typeof value !== 'object') {
    throw new Error(`Missing usage at ${location}`);
  }

  const usage = value as Usage;
  if (
    typeof usage.input_tokens !== 'number' ||
    typeof usage.output_tokens !== 'number'
  ) {
    throw new Error(`Invalid usage at ${location}`);
  }

  return usage;
}

async function observeStream({
  apiKey,
  model,
}: {
  apiKey: string;
  model: string;
}): Promise<StreamObservation> {
  const response = await fetch(`${gatewayBaseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 32,
      stream: true,
      messages: [{ role: 'user', content: 'Say hi in one word.' }],
    }),
    signal: AbortSignal.timeout(90_000),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `Gateway stream request for ${model} failed with HTTP ${response.status}: ${body}`,
    );
  }

  const events = parseSseData(body);
  const messageStart = events.find(event => event.type === 'message_start');
  const messageDelta = events.find(event => event.type === 'message_delta');

  if (messageStart == null || messageDelta == null) {
    throw new Error(`Gateway stream for ${model} omitted required events`);
  }

  const message = messageStart.message;
  if (message == null || typeof message !== 'object') {
    throw new Error(`Gateway stream for ${model} has no start message`);
  }

  return {
    model,
    startUsage: readUsage(
      (message as Record<string, unknown>).usage,
      `${model} message_start`,
    ),
    finalUsage: readUsage(messageDelta.usage, `${model} message_delta`),
  };
}

async function observeCountTokens({
  apiKey,
}: {
  apiKey: string;
}): Promise<{ status: number; body: string }> {
  const response = await fetch(`${gatewayBaseUrl}/v1/messages/count_tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'xai/grok-4.5',
      messages: [{ role: 'user', content: 'hi' }],
    }),
    signal: AbortSignal.timeout(90_000),
  });

  return { status: response.status, body: await response.text() };
}

function hasZeroStartAndPositiveFinal({
  startUsage,
  finalUsage,
}: StreamObservation): boolean {
  return (
    startUsage.input_tokens === 0 &&
    startUsage.output_tokens === 0 &&
    (finalUsage.input_tokens ?? 0) > 0 &&
    (finalUsage.output_tokens ?? 0) > 0
  );
}

async function main(): Promise<void> {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (apiKey == null || apiKey.length === 0) {
    throw new Error('AI_GATEWAY_API_KEY is required');
  }

  const observations = await Promise.all([
    observeStream({ apiKey, model: 'anthropic/claude-haiku-4.5' }),
    observeStream({ apiKey, model: 'xai/grok-4.5' }),
  ]);
  const countTokens = await observeCountTokens({ apiKey });

  const failures: string[] = [];

  for (const observation of observations) {
    console.log(
      `${observation.model}: message_start=${observation.startUsage.input_tokens}/${observation.startUsage.output_tokens}, message_delta=${observation.finalUsage.input_tokens}/${observation.finalUsage.output_tokens}`,
    );

    if (hasZeroStartAndPositiveFinal(observation)) {
      failures.push(
        `ISSUE #17326: message_start usage is zero while terminal usage is non-zero for ${observation.model}`,
      );
    }
  }

  console.log(
    `xai/grok-4.5 count_tokens: HTTP ${countTokens.status} ${countTokens.body}`,
  );
  if (
    countTokens.status === 404 &&
    countTokens.body.includes('"type":"not_found_error"')
  ) {
    failures.push(
      'ISSUE #17326: count_tokens returns Anthropic not_found_error for xai/grok-4.5',
    );
  }

  if (failures.length > 0) {
    throw new Error(failures.join('\n'));
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
