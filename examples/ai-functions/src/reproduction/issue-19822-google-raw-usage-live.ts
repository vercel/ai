import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText, streamText } from 'ai';

type Usage = Record<string, unknown>;

function parseUsageEvents(url: string, body: string): Usage[] {
  if (!url.includes('streamGenerateContent')) {
    const value = JSON.parse(body) as { usageMetadata?: Usage };
    return value.usageMetadata == null ? [] : [value.usageMetadata];
  }

  return body
    .split('\n')
    .filter(line => line.startsWith('data: '))
    .map(line => JSON.parse(line.slice(6)) as { usageMetadata?: Usage })
    .flatMap(value =>
      value.usageMetadata == null ? [] : [value.usageMetadata],
    );
}

async function main() {
  const captures: Array<Promise<{ url: string; usageEvents: Usage[] }>> = [];
  const google = createGoogleGenerativeAI({
    fetch: async (input, init) => {
      const response = await globalThis.fetch(input, init);
      const url = String(input);
      const clone = response.clone();
      captures.push(
        clone.text().then(body => ({
          url,
          usageEvents: parseUsageEvents(url, body),
        })),
      );
      return response;
    },
  });

  const tools = {
    google_search: google.tools.googleSearch({}),
  };

  const generateResult = await generateText({
    model: google('gemini-2.5-flash'),
    prompt:
      'Search the web and state the current date in the United States in one sentence.',
    tools,
  });
  const generateCapture = await captures[0];

  const streamResult = streamText({
    model: google('gemini-2.5-flash'),
    prompt:
      'Search the web and state the current date in the United States in one sentence.',
    tools,
  });
  await streamResult.consumeStream();
  const streamUsage = await streamResult.usage;
  const streamCapture = await captures[1];

  console.log(
    JSON.stringify(
      {
        generate: {
          providerBoundaryUsageEvents: generateCapture.usageEvents,
          usageRaw: generateResult.usage.raw,
          normalized: generateResult.usage,
        },
        stream: {
          providerBoundaryUsageEvents: streamCapture.usageEvents,
          usageRaw: streamUsage.raw,
          normalized: streamUsage,
        },
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
