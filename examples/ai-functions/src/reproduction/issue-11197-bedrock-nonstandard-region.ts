import { createAmazonBedrock } from '../../../../packages/amazon-bedrock/src';

const ISO_REGION = 'us-iso-east-1';
const EXPECTED_ISO_ORIGIN = 'https://bedrock-runtime.us-iso-east-1.c2s.ic.gov';
const SERVICE_OVERRIDE = 'https://bedrock-runtime.override.example';

async function captureRequestUrl(options: {
  region: string;
  endpointOverride?: string;
}): Promise<string> {
  const previousOverride = process.env.AWS_ENDPOINT_URL_BEDROCK_RUNTIME;

  if (options.endpointOverride == null) {
    delete process.env.AWS_ENDPOINT_URL_BEDROCK_RUNTIME;
  } else {
    process.env.AWS_ENDPOINT_URL_BEDROCK_RUNTIME = options.endpointOverride;
  }

  let requestUrl: string | undefined;

  try {
    const provider = createAmazonBedrock({
      apiKey: 'reproduction-api-key',
      region: options.region,
      fetch: async input => {
        requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url;

        return new Response(
          JSON.stringify({
            metrics: { latencyMs: 1 },
            output: {
              message: {
                content: [{ text: 'ok' }],
                role: 'assistant',
              },
            },
            stopReason: 'end_turn',
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
            },
          }),
          {
            headers: { 'content-type': 'application/json' },
            status: 200,
          },
        );
      },
    });

    await provider('anthropic.claude-3-haiku-20240307-v1:0').doGenerate({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Reply with ok.' }],
        },
      ],
    });
  } finally {
    if (previousOverride == null) {
      delete process.env.AWS_ENDPOINT_URL_BEDROCK_RUNTIME;
    } else {
      process.env.AWS_ENDPOINT_URL_BEDROCK_RUNTIME = previousOverride;
    }
  }

  if (requestUrl == null) {
    throw new Error('The reproduction did not observe an outgoing request.');
  }

  return requestUrl;
}

async function main() {
  const automaticUrl = await captureRequestUrl({ region: ISO_REGION });
  const overrideUrl = await captureRequestUrl({
    endpointOverride: SERVICE_OVERRIDE,
    region: ISO_REGION,
  });

  const automaticOrigin = new URL(automaticUrl).origin;
  const overrideOrigin = new URL(overrideUrl).origin;

  if (
    automaticOrigin !== EXPECTED_ISO_ORIGIN ||
    overrideOrigin !== SERVICE_OVERRIDE
  ) {
    console.error(
      [
        'Issue #11197 reproduced: Bedrock Runtime selected incorrect endpoints.',
        `Automatic ISO endpoint: ${automaticOrigin}`,
        `Expected ISO endpoint: ${EXPECTED_ISO_ORIGIN}`,
        `AWS_ENDPOINT_URL_BEDROCK_RUNTIME endpoint: ${overrideOrigin}`,
        `Expected service override: ${SERVICE_OVERRIDE}`,
      ].join('\n'),
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
