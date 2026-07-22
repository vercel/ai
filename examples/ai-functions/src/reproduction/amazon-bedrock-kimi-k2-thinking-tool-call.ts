import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { stepCountIs, streamText, tool } from 'ai';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const modelId = 'moonshot.kimi-k2-thinking';
const expectedAnswer = 'FOUND ISSUE_11409_CONTENT';
const fixtureNames = [
  'issue-11409-kimi-k2-thinking-glob-search.chunks.txt',
  'issue-11409-kimi-k2-thinking-read-file.chunks.txt',
  'issue-11409-kimi-k2-thinking-final.chunks.txt',
];

type AttemptResult = {
  attempt: number;
  executedTools: string[];
  finalText: string;
  visibleText: string;
  leakedToolSyntax: boolean;
  reproducedPrimaryBug: boolean;
  rawChunksByStep: unknown[][];
};

async function runAttempt(attempt: number): Promise<AttemptResult> {
  const executedTools: string[] = [];
  const rawChunksByStep: unknown[][] = [];
  let currentStep = -1;
  let visibleText = '';

  const bedrock = createAmazonBedrock({
    region: process.env.AWS_REGION ?? 'us-east-1',
  });

  const result = streamText({
    model: bedrock(modelId),
    prompt: [
      'Inspect this repository for Cursor-related files.',
      'You must first call glob_search with the exact pattern **/*cursor*.',
      'The glob result will include FILE1. You must then call read_file with target_file FILE1.',
      `Only after reading FILE1, answer exactly ${expectedAnswer}.`,
      'Do not skip either tool and do not write tool arguments as ordinary text.',
    ].join(' '),
    tools: {
      glob_search: tool({
        description: 'Find repository files matching a glob pattern.',
        inputSchema: z.object({
          pattern: z.string(),
        }),
        execute: async ({ pattern }) => {
          executedTools.push('glob_search');
          return pattern === '**/*cursor*'
            ? { files: ['FILE1', 'FILE2'] }
            : { files: [] };
        },
      }),
      read_file: tool({
        description: 'Read a repository file.',
        inputSchema: z.object({
          target_file: z.string(),
        }),
        execute: async ({ target_file }) => {
          executedTools.push('read_file');
          return target_file === 'FILE1'
            ? expectedAnswer
            : `UNEXPECTED_FILE ${target_file}`;
        },
      }),
    },
    stopWhen: stepCountIs(5),
    maxOutputTokens: 4096,
    maxRetries: 0,
    includeRawChunks: true,
  });

  for await (const part of result.fullStream) {
    if (part.type === 'start-step') {
      currentStep += 1;
      rawChunksByStep[currentStep] = [];
    } else if (part.type === 'raw') {
      rawChunksByStep[Math.max(currentStep, 0)] ??= [];
      rawChunksByStep[Math.max(currentStep, 0)].push(part.rawValue);
    } else if (part.type === 'text-delta') {
      visibleText += part.text;
    }
  }

  const steps = await result.steps;
  const finalText = steps.at(-1)?.text ?? '';
  const leakedToolSyntax =
    /<\|tool_call_(?:begin|argument_begin|end)s?\|>/.test(visibleText) ||
    /<\|tool_calls_section_end\|>/.test(visibleText) ||
    /"pattern"\s*:\s*"\*\*\/\*cursor\*"/.test(visibleText) ||
    /"target_file"\s*:\s*"FILE1"/.test(visibleText);
  const reproducedPrimaryBug =
    !executedTools.includes('read_file') &&
    !finalText.trim().endsWith(expectedAnswer) &&
    /target_file|FILE1|tool_call|function_calls/.test(visibleText);

  return {
    attempt,
    executedTools,
    finalText,
    visibleText,
    leakedToolSyntax,
    reproducedPrimaryBug,
    rawChunksByStep,
  };
}

function recordFixtures(result: AttemptResult) {
  const fixtureDirectory = path.resolve(
    process.cwd(),
    '../../packages/amazon-bedrock/src/__fixtures__',
  );

  fixtureNames.forEach((fixtureName, index) => {
    const chunks = result.rawChunksByStep[index];
    const fixturePath = path.join(fixtureDirectory, fixtureName);
    if (chunks == null) {
      if (fs.existsSync(fixturePath)) {
        fs.unlinkSync(fixturePath);
      }
      return;
    }

    fs.writeFileSync(
      fixturePath,
      `${chunks.map(chunk => JSON.stringify(chunk)).join('\n')}\n`,
    );
  });
}

async function main() {
  const results: AttemptResult[] = [];
  const attemptCount = Number(process.env.ISSUE_11409_ATTEMPTS ?? '10');

  for (let attempt = 1; attempt <= attemptCount; attempt += 1) {
    const result = await runAttempt(attempt);
    results.push(result);

    console.log(
      JSON.stringify({
        attempt: result.attempt,
        executedTools: result.executedTools,
        finalText: result.finalText,
        leakedToolSyntax: result.leakedToolSyntax,
        reproducedPrimaryBug: result.reproducedPrimaryBug,
      }),
    );
  }

  const reproduced = results.find(result => result.reproducedPrimaryBug);
  if (process.env.RECORD_ISSUE_11409_FIXTURES === '1' && reproduced != null) {
    recordFixtures(reproduced);
  }

  if (reproduced != null) {
    console.error(
      `ISSUE_11409_REPRODUCED: attempt ${reproduced.attempt} emitted the intended read_file call as text, did not execute read_file, and ended without ${expectedAnswer}`,
    );
    process.exitCode = 1;
    return;
  }

  const allCompleted = results.every(
    result =>
      result.executedTools.includes('glob_search') &&
      result.executedTools.includes('read_file') &&
      result.finalText.trim().endsWith(expectedAnswer),
  );

  if (!allCompleted) {
    console.error(
      'ISSUE_11409_INCONCLUSIVE: at least one attempt did not complete the required tool sequence, but the reported text-only read_file call was not observed',
    );
    process.exitCode = 2;
    return;
  }

  console.log(
    'ISSUE_11409_NOT_REPRODUCED: all attempts executed glob_search and read_file and returned FOUND ISSUE_11409_CONTENT',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
