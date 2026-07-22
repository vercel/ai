import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';

const MODEL_ID = 'moonshot.kimi-k2-thinking';
const ATTEMPTS = 3;
const expectedAnswer = 'FOUND ISSUE_11409_CONTENT';

type AttemptResult = {
  attempt: number;
  finishReason: string;
  text: string;
  toolCalls: string[];
  rawChunks: unknown[];
  leakedToolMarkers: boolean;
  toolLikeJsonText: boolean;
  leakedToolSyntax: boolean;
  completedTask: boolean;
};

async function runAttempt(attempt: number): Promise<AttemptResult> {
  const amazonBedrock = createAmazonBedrock({ region: 'us-east-1' });
  const toolCalls: string[] = [];
  const rawChunks: unknown[] = [];
  let text = '';

  const result = streamText({
    model: amazonBedrock(MODEL_ID),
    includeRawChunks: true,
    maxOutputTokens: 2048,
    stopWhen: stepCountIs(5),
    tools: {
      glob_search: tool({
        description: 'Find repository files whose paths match a glob pattern.',
        inputSchema: z.object({ pattern: z.string() }),
        execute: async ({ pattern }) => {
          toolCalls.push(`glob_search:${pattern}`);
          return { files: ['src/cursor-config.ts', '.cursor/rules.md'] };
        },
      }),
      read_file: tool({
        description: 'Read the complete contents of a repository file.',
        inputSchema: z.object({ target_file: z.string() }),
        execute: async ({ target_file }) => {
          toolCalls.push(`read_file:${target_file}`);
          return { content: 'ISSUE_11409_CONTENT' };
        },
      }),
    },
    prompt: `Check whether this repository has cursor files.
You must first call glob_search with {"pattern":"**/*cursor*"}.
After glob_search returns files, you must call read_file for src/cursor-config.ts.
After read_file returns, answer with exactly: ${expectedAnswer}`,
  });

  for await (const part of result.fullStream) {
    if (part.type === 'raw') {
      rawChunks.push(part.rawValue);
    } else if (part.type === 'text-delta') {
      text += part.text;
    }
  }

  const finishReason = await result.finishReason;
  const leakedToolMarkers =
    /<\|tool_call_(?:begin|argument_begin|end)\|>|<\|tool_calls_section_end\|>/.test(
      text,
    );
  const toolLikeJsonText = /\{\s*"(?:target_file|pattern)"\s*:/.test(text);
  const leakedToolSyntax = leakedToolMarkers || toolLikeJsonText;
  const completedTask =
    toolCalls.some(call => call.startsWith('glob_search:')) &&
    toolCalls.some(call => call === 'read_file:src/cursor-config.ts') &&
    text.includes(expectedAnswer);

  return {
    attempt,
    finishReason,
    text,
    toolCalls,
    rawChunks,
    leakedToolMarkers,
    toolLikeJsonText,
    leakedToolSyntax,
    completedTask,
  };
}

async function main() {
  const attempts: AttemptResult[] = [];

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const result = await runAttempt(attempt);
    attempts.push(result);
    console.log(JSON.stringify(result));

    if (!result.completedTask) {
      console.error(
        `ISSUE_11409_REPRODUCED: intended read_file tool call was not completed and the task ended before the expected answer; leakedToolSyntax=${result.leakedToolSyntax}`,
      );
      process.exitCode = 1;
      return;
    }
  }

  const leaked = attempts.filter(attempt => attempt.leakedToolSyntax);
  const markerLeaks = attempts.filter(attempt => attempt.leakedToolMarkers);
  const jsonLeaks = attempts.filter(attempt => attempt.toolLikeJsonText);
  console.log(
    `Could not reproduce the abrupt termination from issue #11409 in ${ATTEMPTS} attempts: every attempt called both tools and returned the expected final answer. ${markerLeaks.length} attempt(s) contained the reported tool markers; ${jsonLeaks.length} attempt(s) contained tool-like JSON in provider text; ${leaked.length} attempt(s) contained either form.`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
