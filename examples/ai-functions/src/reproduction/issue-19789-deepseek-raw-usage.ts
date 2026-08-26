import { isDeepStrictEqual } from 'node:util';
import { createDeepSeek } from '@ai-sdk/deepseek';
import type { JSONObject, JSONValue } from '@ai-sdk/provider';
import { parseJSON } from '@ai-sdk/provider-utils';
import { generateText, streamText } from 'ai';

type CapturedUsage = {
  json: JSONObject[];
  stream: JSONObject[];
};

function isJSONObject(value: JSONValue | undefined): value is JSONObject {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

async function parseUsageFromJSON(
  text: string,
): Promise<JSONObject | undefined> {
  const body = await parseJSON({ text });

  if (!isJSONObject(body) || !isJSONObject(body.usage)) {
    return undefined;
  }

  return body.usage;
}

async function parseUsageFromSSE(text: string): Promise<JSONObject[]> {
  const usages: JSONObject[] = [];

  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('data:')) {
      continue;
    }

    const data = line.slice('data:'.length).trim();

    if (data.length === 0 || data === '[DONE]') {
      continue;
    }

    const chunk = await parseJSON({ text: data });

    if (isJSONObject(chunk) && isJSONObject(chunk.usage)) {
      usages.push(chunk.usage);
    }
  }

  return usages;
}

async function main() {
  const captured: CapturedUsage = { json: [], stream: [] };

  const deepseek = createDeepSeek({
    fetch: async (input, init) => {
      const requestBody =
        typeof init?.body === 'string'
          ? await parseJSON({ text: init.body })
          : undefined;
      const isStreamingRequest =
        isJSONObject(requestBody) && requestBody.stream === true;

      const response = await fetch(input, init);

      if (response.ok) {
        const responseText = await response.clone().text();

        if (isStreamingRequest) {
          captured.stream.push(...(await parseUsageFromSSE(responseText)));
        } else {
          const usage = await parseUsageFromJSON(responseText);

          if (usage != null) {
            captured.json.push(usage);
          }
        }
      }

      return response;
    },
  });

  const prompt = 'Reply with exactly: OK';
  const model = deepseek('deepseek-v4-flash');

  const generateResult = await generateText({ model, prompt });
  const streamResult = streamText({ model, prompt });
  const streamFinalStep = await streamResult.finalStep;

  const jsonProviderUsage = captured.json.at(-1);
  const streamProviderUsage = captured.stream.at(-1);

  if (jsonProviderUsage == null || streamProviderUsage == null) {
    throw new Error(
      'DeepSeek did not return usage on both JSON and streaming Chat Completions paths.',
    );
  }

  const jsonRawUsage = generateResult.finalStep.usage.raw;
  const streamRawUsage = streamFinalStep.usage.raw;
  const jsonPreserved = isDeepStrictEqual(jsonRawUsage, jsonProviderUsage);
  const streamPreserved = isDeepStrictEqual(
    streamRawUsage,
    streamProviderUsage,
  );

  console.log(
    JSON.stringify(
      {
        json: {
          providerUsage: jsonProviderUsage,
          finalStepRawUsage: jsonRawUsage,
          finalStepNormalizedUsage: generateResult.finalStep.usage,
          preserved: jsonPreserved,
        },
        stream: {
          providerUsageObjects: captured.stream,
          finalProviderUsage: streamProviderUsage,
          finalStepRawUsage: streamRawUsage,
          finalStepNormalizedUsage: streamFinalStep.usage,
          preserved: streamPreserved,
        },
      },
      null,
      2,
    ),
  );

  if (!jsonPreserved || !streamPreserved) {
    throw new Error(
      'Reproduced issue #19789: DeepSeek final-step usage.raw did not preserve the complete provider usage object.',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
