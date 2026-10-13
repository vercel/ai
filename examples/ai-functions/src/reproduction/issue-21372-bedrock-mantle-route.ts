import { createBedrockMantle } from '@ai-sdk/amazon-bedrock/mantle';
import { APICallError } from '@ai-sdk/provider';
import { generateText } from 'ai';

const region = 'us-east-1';
const modelId = process.env.ISSUE_21372_MODEL ?? 'openai.gpt-6-sol';
const openAIBaseURL = `https://bedrock-mantle.${region}.api.aws/openai/v1`;

type Attempt = {
  error?: unknown;
  label: string;
  text?: string;
  url?: string;
};

function capturingFetch(attempt: Attempt): typeof fetch {
  return async (input, init) => {
    attempt.url =
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.href
          : input;
    return globalThis.fetch(input, init);
  };
}

async function attempt({
  api,
  baseURL,
  label,
}: {
  api: 'chat' | 'responses';
  baseURL?: string;
  label: string;
}): Promise<Attempt> {
  const result: Attempt = { label };
  const provider = createBedrockMantle({
    baseURL,
    fetch: capturingFetch(result),
    region,
  });

  try {
    const generation = await generateText({
      abortSignal: AbortSignal.timeout(60_000),
      maxRetries: 0,
      model:
        api === 'chat' ? provider.chat(modelId) : provider.responses(modelId),
      prompt: 'Reply with exactly: pong',
    });
    result.text = generation.text;
  } catch (error) {
    result.error = error;
  }

  return result;
}

function printAttempt(result: Attempt): void {
  if (result.error === undefined) {
    console.log(
      `${result.label}: OK url=${result.url} text=${JSON.stringify(result.text)}`,
    );
    return;
  }

  if (APICallError.isInstance(result.error)) {
    console.log(
      `${result.label}: ERROR status=${result.error.statusCode} url=${result.url} body=${result.error.responseBody}`,
    );
    return;
  }

  console.log(
    `${result.label}: ERROR url=${result.url} error=${String(result.error)}`,
  );
}

function isReportedWrongRouteFailure(result: Attempt): boolean {
  return (
    APICallError.isInstance(result.error) &&
    result.error.statusCode === 400 &&
    (result.error.responseBody?.includes("isn't supported on this route") ===
      true ||
      result.error.responseBody?.includes(
        "does not support the '/v1/responses' API",
      ) === true)
  );
}

async function main(): Promise<void> {
  const defaultChat = await attempt({
    api: 'chat',
    label: 'default chat',
  });
  const explicitChat = await attempt({
    api: 'chat',
    baseURL: openAIBaseURL,
    label: 'explicit /openai/v1 chat',
  });
  const defaultResponses = await attempt({
    api: 'responses',
    label: 'default responses',
  });
  const explicitResponses = await attempt({
    api: 'responses',
    baseURL: openAIBaseURL,
    label: 'explicit /openai/v1 responses',
  });

  const results = [
    defaultChat,
    explicitChat,
    defaultResponses,
    explicitResponses,
  ];
  results.forEach(printAttempt);

  for (const explicitResult of [explicitChat, explicitResponses]) {
    if (explicitResult.error !== undefined) {
      throw explicitResult.error;
    }
  }

  if ([defaultChat, defaultResponses].some(isReportedWrongRouteFailure)) {
    throw new Error(
      'ISSUE_21372_REPRODUCED: default Mantle routing rejected a supported model that succeeded through /openai/v1',
    );
  }

  for (const defaultResult of [defaultChat, defaultResponses]) {
    if (defaultResult.error !== undefined) {
      throw defaultResult.error;
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
