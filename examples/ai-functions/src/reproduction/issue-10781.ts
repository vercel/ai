import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { isStepCount, streamText, tool } from 'ai';
import fs from 'node:fs';
import { z } from 'zod';

type TextBoundary = {
  type: 'text-start' | 'text-end';
  id: string;
  step: number;
};

async function main() {
  const providerName = process.argv[2] ?? 'anthropic';
  const shouldRecord = process.argv.includes('--record');
  const model =
    providerName === 'anthropic'
      ? anthropic('claude-sonnet-4-5')
      : providerName === 'google'
        ? google('gemini-3.1-pro-preview')
        : providerName === 'google-original'
          ? google('gemini-3-pro-preview')
          : providerName === 'openai'
            ? openai('gpt-5-mini')
            : undefined;

  if (model == null) {
    throw new Error(`Unknown provider: ${providerName}`);
  }

  const boundaries: TextBoundary[] = [];
  const providerTextBlockStarts: Array<{ index: number; step: number }> = [];
  const rawChunksByStep: unknown[][] = [];
  let step = -1;

  const result = streamText({
    model,
    instructions:
      'You must first say exactly "Let me check." and then call get_weather. After the tool result, summarize the weather in one sentence.',
    prompt: 'What is the weather in San Francisco?',
    tools: {
      get_weather: tool({
        description: 'Get the current weather for a city.',
        inputSchema: z.object({ city: z.string() }),
        execute: async () => ({
          temperature: 72,
          condition: 'sunny',
        }),
      }),
    },
    stopWhen: isStepCount(2),
    includeRawChunks: true,
  });

  for await (const chunk of result.fullStream) {
    if (chunk.type === 'start-step') {
      step++;
      rawChunksByStep.push([]);
    } else if (chunk.type === 'text-start' || chunk.type === 'text-end') {
      boundaries.push({ type: chunk.type, id: chunk.id, step });
      console.log(`step=${step} type=${chunk.type} id=${chunk.id}`);
    } else if (chunk.type === 'raw') {
      rawChunksByStep.at(-1)?.push(chunk.rawValue);

      if (
        typeof chunk.rawValue === 'object' &&
        chunk.rawValue != null &&
        'type' in chunk.rawValue &&
        chunk.rawValue.type === 'content_block_start' &&
        'index' in chunk.rawValue &&
        typeof chunk.rawValue.index === 'number' &&
        'content_block' in chunk.rawValue &&
        typeof chunk.rawValue.content_block === 'object' &&
        chunk.rawValue.content_block != null &&
        'type' in chunk.rawValue.content_block &&
        chunk.rawValue.content_block.type === 'text'
      ) {
        providerTextBlockStarts.push({
          index: chunk.rawValue.index,
          step,
        });
      }
    }
  }

  if (
    shouldRecord &&
    (providerName === 'anthropic' || providerName === 'google')
  ) {
    const fixtureDirectory =
      providerName === 'anthropic'
        ? '../../packages/anthropic/src/__fixtures__'
        : '../../packages/google/src/__fixtures__';

    rawChunksByStep.forEach((chunks, index) => {
      fs.writeFileSync(
        `${fixtureDirectory}/issue-10781.${index + 1}.chunks.txt`,
        chunks.map(chunk => JSON.stringify(chunk)).join('\n'),
      );
    });
  }

  const starts = boundaries.filter(boundary => boundary.type === 'text-start');
  const ends = boundaries.filter(boundary => boundary.type === 'text-end');
  const duplicateStartIds = starts.filter(
    (boundary, index) =>
      starts.findIndex(candidate => candidate.id === boundary.id) !== index,
  );
  const duplicateEndIds = ends.filter(
    (boundary, index) =>
      ends.findIndex(candidate => candidate.id === boundary.id) !== index,
  );

  if (starts.length < 2 || ends.length < 2) {
    throw new Error(
      `The live flow did not produce two complete text blocks: starts=${starts.length}, ends=${ends.length}`,
    );
  }

  if (providerName === 'openai') {
    console.log(
      `OpenAI emitted matching text boundaries: starts=${starts.length}, ends=${ends.length}`,
    );
    return;
  }

  if (duplicateStartIds.length > 0 && duplicateEndIds.length > 0) {
    console.error(
      `ISSUE #10781 REPRODUCED (${providerName}): duplicate text-start/text-end IDs across steps; provider text indexes=${JSON.stringify(providerTextBlockStarts)}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Issue #10781 did not reproduce: ${JSON.stringify({ starts, ends, providerTextBlockStarts })}`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
