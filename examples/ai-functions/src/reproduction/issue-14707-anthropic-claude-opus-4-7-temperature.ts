import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type * as AiModule from '../../../../packages/ai/src/index';
import type * as AnthropicModule from '../../../../packages/anthropic/src/index';

const modelId = 'claude-opus-4-7';
const temperature = 0.7;
const prompt = 'Respond with exactly OK.';
const expectedIssueError = '`temperature` is deprecated for this model.';

type JsonObject = Record<string, unknown>;
type AiModuleWithDefault = typeof AiModule & { default?: typeof AiModule };
type AnthropicModuleWithDefault = typeof AnthropicModule & {
  default?: typeof AnthropicModule;
};

type RecordedRequest = {
  url: string;
  method: string;
  body: unknown;
};

type RecordedResponse = {
  status: number;
  ok: boolean;
  body: unknown;
};

async function requestBodyToText(body: BodyInit | null | undefined) {
  if (body == null) {
    return undefined;
  }

  if (typeof body === 'string') {
    return body;
  }

  if (body instanceof URLSearchParams) {
    return body.toString();
  }

  if (body instanceof Blob) {
    return await body.text();
  }

  if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(body);
  }

  if (ArrayBuffer.isView(body)) {
    return new TextDecoder().decode(body);
  }

  return String(body);
}

function parseJsonIfPossible(text: string | undefined) {
  if (text == null || text.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function hasOwnProperty(value: unknown, key: string) {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.prototype.hasOwnProperty.call(value, key)
  );
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    const extra = error as Error & {
      statusCode?: number;
      responseBody?: unknown;
      data?: unknown;
    };

    return {
      name: error.name,
      message: error.message,
      statusCode: extra.statusCode,
      responseBody: extra.responseBody,
      data: extra.data,
    };
  }

  return { message: String(error) };
}

async function main() {
  const anthropicModule =
    (await import('../../../../packages/anthropic/src/index')) as AnthropicModuleWithDefault;
  const aiModule =
    (await import('../../../../packages/ai/src/index')) as AiModuleWithDefault;
  const { createAnthropic } = anthropicModule.default ?? anthropicModule;
  const { generateText } = aiModule.default ?? aiModule;

  let recordedRequest: RecordedRequest | undefined;
  let recordedResponse: RecordedResponse | undefined;
  let outcome: JsonObject;
  let caughtError: unknown;

  const anthropic = createAnthropic({
    fetch: async (url, options) => {
      const requestText = await requestBodyToText(options?.body);
      recordedRequest = {
        url: String(url),
        method: options?.method ?? 'POST',
        body: parseJsonIfPossible(requestText),
      };

      const response = await fetch(url, options);
      const responseText = await response.clone().text();
      recordedResponse = {
        status: response.status,
        ok: response.ok,
        body: parseJsonIfPossible(responseText),
      };

      return response;
    },
  });

  try {
    const result = await generateText({
      model: anthropic(modelId),
      prompt,
      temperature,
      maxOutputTokens: 5,
    });

    outcome = {
      type: 'success',
      text: result.text,
      warnings: result.warnings,
    };
  } catch (error) {
    caughtError = error;
    outcome = {
      type: 'error',
      error: serializeError(error),
    };
  }

  const requestBodyIncludesTemperature = hasOwnProperty(
    recordedRequest?.body,
    'temperature',
  );

  const fixture = {
    issue: 14707,
    classification: 'provider-specific Anthropic model capability behavior',
    modelId,
    input: {
      prompt,
      temperature,
      maxOutputTokens: 5,
    },
    expectedIssueError,
    requestBodyIncludesTemperature,
    request: recordedRequest,
    response: recordedResponse,
    sdkResult: outcome,
  };

  if (recordedResponse != null) {
    const repoRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../..',
    );
    const fixturePath = path.join(
      repoRoot,
      'packages/anthropic/src/__fixtures__/issue-14707-claude-opus-4-7-temperature-live.json',
    );
    await mkdir(path.dirname(fixturePath), { recursive: true });
    await writeFile(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`);
  }

  console.log(
    JSON.stringify(
      {
        modelId,
        suppliedTemperature: temperature,
        expectedIssueError,
        requestBodyIncludesTemperature,
        responseStatus: recordedResponse?.status,
        outcome,
      },
      null,
      2,
    ),
  );

  if (caughtError != null) {
    throw caughtError;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
