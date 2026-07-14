import { createGateway, generateText } from 'ai';

type RecordedGatewayCall = {
  specificationVersion?: string;
  responseStatus?: number;
  responseBody?: unknown;
};

async function main() {
  const recordedCall: RecordedGatewayCall = {};
  const nativeFetch = globalThis.fetch;

  const recordingFetch: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    recordedCall.specificationVersion =
      headers.get('ai-language-model-specification-version') ?? undefined;

    const response = await nativeFetch(input, init);
    recordedCall.responseStatus = response.status;

    try {
      recordedCall.responseBody = await response.clone().json();
    } catch {
      recordedCall.responseBody = await response.clone().text();
    }

    return response;
  };

  const gateway = createGateway({
    apiKey: process.env.AI_GATEWAY_API_KEY!,
    baseURL: 'https://ai-gateway.vercel.sh/v1/ai',
    fetch: recordingFetch,
  });

  const result = await generateText({
    model: gateway('openai/gpt-4o-mini'),
    prompt: 'Say hi',
    maxOutputTokens: 20,
  });

  const observed = {
    sdkUsage: result.usage,
    gatewayCall: recordedCall,
  };

  console.log(JSON.stringify(observed, null, 2));

  const tokenCounts = [
    result.usage.inputTokens,
    result.usage.outputTokens,
    result.usage.totalTokens,
  ];

  if (!tokenCounts.every(value => Number.isFinite(value))) {
    throw new Error(
      `Reproduced issue #12771: expected inputTokens, outputTokens, and totalTokens to be numbers, but received ${JSON.stringify(result.usage)}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
