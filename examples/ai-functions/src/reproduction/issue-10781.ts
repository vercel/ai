import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { stepCountIs, streamText, tool } from 'ai';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';

type ProviderName = 'anthropic' | 'google' | 'openai';

const providerName =
  (process.env.ISSUE_10781_PROVIDER as ProviderName | undefined) ?? 'anthropic';
const recordFixtures = process.env.ISSUE_10781_RECORD_FIXTURES === '1';
const googleModel =
  process.env.ISSUE_10781_GOOGLE_MODEL ?? 'gemini-3.1-pro-preview';

const models = {
  anthropic: anthropic('claude-sonnet-4-5'),
  google: google(googleModel),
  openai: openai.responses('gpt-5-mini'),
};

async function main() {
  const textStarts: Array<{ id: string; step: number }> = [];
  const textDeltas: Array<{ id: string; step: number }> = [];
  const textEnds: Array<{ id: string; step: number }> = [];
  const rawChunksByStep = new Map<number, unknown[]>();
  let currentStep = 0;
  let toolCallCount = 0;

  const result = streamText({
    model: models[providerName],
    system: [
      'Follow this two-turn procedure exactly.',
      'Before calling get_weather, output the text "Let me check."',
      'Then call get_weather exactly once.',
      'After receiving the tool result, output a short weather summary and do not call any tool.',
    ].join(' '),
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
    stopWhen: stepCountIs(2),
    includeRawChunks: recordFixtures,
  });

  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'start-step':
        currentStep++;
        break;
      case 'text-start':
        textStarts.push({ id: chunk.id, step: currentStep });
        console.log(
          `[${providerName}] step ${currentStep} text-start id="${chunk.id}"`,
        );
        break;
      case 'text-delta':
        textDeltas.push({ id: chunk.id, step: currentStep });
        break;
      case 'text-end':
        textEnds.push({ id: chunk.id, step: currentStep });
        console.log(
          `[${providerName}] step ${currentStep} text-end id="${chunk.id}"`,
        );
        break;
      case 'tool-call':
        toolCallCount++;
        break;
      case 'raw': {
        const stepChunks = rawChunksByStep.get(currentStep) ?? [];
        stepChunks.push(chunk.rawValue);
        rawChunksByStep.set(currentStep, stepChunks);
        break;
      }
    }
  }

  if (recordFixtures && providerName !== 'openai') {
    const fixtureDirectory = resolve(
      process.cwd(),
      `../../packages/${providerName}/src/__fixtures__`,
    );

    for (const [step, chunks] of rawChunksByStep) {
      await writeFile(
        resolve(fixtureDirectory, `issue-10781.${step}.chunks.txt`),
        `${chunks.map(chunk => JSON.stringify(chunk)).join('\n')}\n`,
      );
    }
  }

  if (toolCallCount !== 1) {
    throw new Error(
      `Reproduction precondition failed: expected one tool call, observed ${toolCallCount}.`,
    );
  }

  const textSteps = new Set(textStarts.map(part => part.step));
  if (textSteps.size < 2) {
    throw new Error(
      `Reproduction precondition failed: expected text in two steps, observed steps ${JSON.stringify([...textSteps])}.`,
    );
  }

  if (textEnds.length !== textStarts.length) {
    throw new Error(
      `ISSUE_10781_MISSING_TEXT_END expected ${textStarts.length} text-end chunks, observed ${textEnds.length}.`,
    );
  }

  for (const start of textStarts) {
    const hasMatchingEnd = textEnds.some(
      end => end.step === start.step && end.id === start.id,
    );
    if (!hasMatchingEnd) {
      throw new Error(
        `ISSUE_10781_MISSING_TEXT_END no matching text-end for step ${start.step} id "${start.id}".`,
      );
    }
  }

  for (const delta of textDeltas) {
    const hasMatchingStart = textStarts.some(
      start => start.step === delta.step && start.id === delta.id,
    );
    if (!hasMatchingStart) {
      throw new Error(
        `ISSUE_10781_ORPHAN_TEXT_DELTA no matching text-start for step ${delta.step} id "${delta.id}".`,
      );
    }
  }

  const startsById = Map.groupBy(textStarts, part => part.id);
  const duplicate = [...startsById].find(
    ([, parts]) => new Set(parts.map(part => part.step)).size > 1,
  );

  if (duplicate != null) {
    throw new Error(
      `ISSUE_10781_REPRODUCED duplicate text part IDs across steps: ${duplicate[0]}`,
    );
  }

  console.log(
    `[${providerName}] text part IDs are unique across steps and every start has a matching end.`,
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
