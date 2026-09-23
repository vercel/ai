import { createBedrockMantle } from '@ai-sdk/amazon-bedrock/mantle';
import { APICallError } from '@ai-sdk/provider';
import { generateText } from 'ai';

const region = 'us-east-1';
const correctBaseURL = `https://bedrock-mantle.${region}.api.aws/openai/v1`;
const chatModelId = process.env.ISSUE_21372_CHAT_MODEL ?? 'google.gemma-4-31b';
const responsesModelId =
  process.env.ISSUE_21372_RESPONSES_MODEL ?? 'google.gemma-4-31b';

type Attempt = {
  error?: unknown;
  label: string;
  responseBody?: string;
  responseStatus?: number;
  text?: string;
  url?: string;
};

function createCapturingFetch(attempt: Attempt): typeof fetch {
  return async (input, init) => {
    attempt.url =
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.href
          : input;
    const response = await globalThis.fetch(input, init);
    attempt.responseStatus = response.status;
    attempt.responseBody = await response.clone().text();
    return response;
  };
}

async function runAttempt({
  api,
  baseURL,
  label,
  modelId,
}: {
  api: 'chat' | 'responses';
  baseURL?: string;
  label: string;
  modelId: string;
}): Promise<Attempt> {
  const attempt: Attempt = { label };
  const provider = createBedrockMantle({
    baseURL,
    fetch: createCapturingFetch(attempt),
    region,
  });

  try {
    const result = await generateText({
      abortSignal: AbortSignal.timeout(60_000),
      maxRetries: 0,
      model:
        api === 'chat' ? provider.chat(modelId) : provider.responses(modelId),
      prompt: 'Reply with exactly: pong',
    });
    attempt.text = result.text;
  } catch (error) {
    attempt.error = error;
  }

  return attempt;
}

function formatAttempt(attempt: Attempt): string {
  if (attempt.error === undefined) {
    return `${attempt.label}: OK url=${attempt.url} text=${JSON.stringify(attempt.text)}`;
  }

  if (APICallError.isInstance(attempt.error)) {
    return `${attempt.label}: ERROR status=${attempt.error.statusCode} url=${attempt.url} body=${attempt.error.responseBody}`;
  }

  return `${attempt.label}: ERROR url=${attempt.url} error=${String(attempt.error)}`;
}

function isWrongRouteError(attempt: Attempt): boolean {
  return (
    APICallError.isInstance(attempt.error) &&
    attempt.error.statusCode === 400 &&
    (attempt.error.responseBody?.includes("isn't supported on this route") ===
      true ||
      attempt.error.responseBody?.includes(
        "does not support the '/v1/responses' API",
      ) === true)
  );
}

async function main() {
  const defaultChat = await runAttempt({
    api: 'chat',
    label: `default chat ${chatModelId}`,
    modelId: chatModelId,
  });
  const defaultResponses = await runAttempt({
    api: 'responses',
    label: `default responses ${responsesModelId}`,
    modelId: responsesModelId,
  });
  const explicitChat = await runAttempt({
    api: 'chat',
    baseURL: correctBaseURL,
    label: `explicit /openai/v1 chat ${chatModelId}`,
    modelId: chatModelId,
  });
  const explicitResponses = await runAttempt({
    api: 'responses',
    baseURL: correctBaseURL,
    label: `explicit /openai/v1 responses ${responsesModelId}`,
    modelId: responsesModelId,
  });

  const attempts = [
    defaultChat,
    defaultResponses,
    explicitChat,
    explicitResponses,
  ];
  for (const attempt of attempts) {
    console.log(formatAttempt(attempt));
    if (process.env.ISSUE_21372_LOG_RAW_RESPONSES === '1') {
      console.log(
        `${attempt.label}: RAW status=${attempt.responseStatus} body=${attempt.responseBody}`,
      );
    }
  }

  for (const attempt of [explicitChat, explicitResponses]) {
    if (attempt.error !== undefined) {
      throw attempt.error;
    }
  }

  const wrongRouteAttempts = [defaultChat, defaultResponses].filter(
    isWrongRouteError,
  );
  if (wrongRouteAttempts.length > 0) {
    throw new Error(
      'ISSUE_21372_REPRODUCED: default Mantle routing rejected a supported /openai/v1 model while the explicit route succeeded',
    );
  }

  for (const attempt of [defaultChat, defaultResponses]) {
    if (attempt.error !== undefined) {
      throw attempt.error;
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
