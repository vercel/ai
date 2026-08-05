import { openai } from '@ai-sdk/openai';
import assert from 'node:assert/strict';
import { generateText } from 'ai';
import { run } from '../../lib/run';

const blockedDomain = 'wikipedia.org';

run(async () => {
  const result = await generateText({
    model: openai.responses('gpt-5-mini'),
    prompt: 'What is the Vercel AI SDK? Use web search and cite your sources.',
    tools: {
      web_search: openai.tools.webSearch({
        filters: {
          blockedDomains: [blockedDomain],
        },
      }),
    },
    toolChoice: { type: 'tool', toolName: 'web_search' },
  });

  assert.ok(
    result.sources.every(
      source =>
        source.sourceType !== 'url' ||
        (new URL(source.url).hostname !== blockedDomain &&
          !new URL(source.url).hostname.endsWith(`.${blockedDomain}`)),
    ),
    `Web search returned a source from blocked domain ${blockedDomain}.`,
  );

  console.log(result.text);
  console.log(result.sources);
});
