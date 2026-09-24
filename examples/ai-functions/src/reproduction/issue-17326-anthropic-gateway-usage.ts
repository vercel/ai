type Usage = {
  input_tokens?: number;
  output_tokens?: number;
};

type AnthropicEvent =
  | {
      type: 'message_start';
      message: {
        usage: Usage;
      };
    }
  | {
      type: 'message_delta';
      usage: Usage;
    }
  | {
      type: string;
    };

const gatewayBaseUrl = 'https://ai-gateway.vercel.sh';

function parseEvents(body: string): AnthropicEvent[] {
  return body
    .split(/\r?\n/)
    .filter(line => line.startsWith('data: '))
    .map(line => line.slice('data: '.length))
    .filter(data => data !== '[DONE]')
    .map(data => JSON.parse(data) as AnthropicEvent);
}

async function streamModel({
  apiKey,
  model,
}: {
  apiKey: string;
  model: string;
}) {
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
    signal: AbortSignal.timeout(60_000),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `${model} streaming request failed with HTTP ${response.status}: ${body}`,
    );
  }

  const events = parseEvents(body);
  const messageStart = events.find(event => event.type === 'message_start') as
    | Extract<AnthropicEvent, { type: 'message_start' }>
    | undefined;
  const messageDelta = events.find(event => event.type === 'message_delta') as
    | Extract<AnthropicEvent, { type: 'message_delta' }>
    | undefined;

  if (messageStart == null || messageDelta == null) {
    throw new Error(`${model} did not return both usage-bearing events`);
  }

  return {
    messageStartUsage: messageStart.message.usage,
    messageDeltaUsage: messageDelta.usage,
  };
}

async function countTokens({
  apiKey,
  model,
}: {
  apiKey: string;
  model: string;
}) {
  const response = await fetch(`${gatewayBaseUrl}/v1/messages/count_tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'hi' }],
    }),
    signal: AbortSignal.timeout(60_000),
  });

  return {
    status: response.status,
    body: (await response.json()) as unknown,
  };
}

async function main() {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (apiKey == null || apiKey.length === 0) {
    throw new Error('AI_GATEWAY_API_KEY is required');
  }

  const [xaiStream, anthropicStream, xaiTokenCount] = await Promise.all([
    streamModel({ apiKey, model: 'xai/grok-4.5' }),
    streamModel({ apiKey, model: 'anthropic/claude-haiku-4.5' }),
    countTokens({ apiKey, model: 'xai/grok-4.5' }),
  ]);

  console.log(
    JSON.stringify(
      {
        xaiStream,
        anthropicStream,
        xaiTokenCount,
      },
      null,
      2,
    ),
  );

  const xaiUsageIsLateOnly =
    xaiStream.messageStartUsage.input_tokens === 0 &&
    (xaiStream.messageDeltaUsage.input_tokens ?? 0) > 0;
  const anthropicUsageWasDropped =
    anthropicStream.messageStartUsage.input_tokens === 0 &&
    (anthropicStream.messageDeltaUsage.input_tokens ?? 0) > 0;
  const xaiTokenCountWasForwardedToAnthropic =
    xaiTokenCount.status === 404 &&
    JSON.stringify(xaiTokenCount.body).includes('model: xai/grok-4.5');

  if (
    xaiUsageIsLateOnly &&
    anthropicUsageWasDropped &&
    xaiTokenCountWasForwardedToAnthropic
  ) {
    console.error(
      'ISSUE #17326 REPRODUCED: message_start usage is 0/0 and non-Anthropic count_tokens returns 404',
    );
    process.exitCode = 1;
  }
}

main();
