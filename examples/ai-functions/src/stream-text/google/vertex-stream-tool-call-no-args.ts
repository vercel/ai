import { googleVertex } from '@ai-sdk/google-vertex';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';
import { saveRawChunks } from '../../lib/save-raw-chunks';

// Reproduces the wire shape from issue #14847: Vertex emits a no-args
// function call as a single chunk `{ functionCall: { name: 'X' } }`. With
// Gemini 3 thinking enabled, that chunk also carries the response's
// thoughtSignature, which the streaming parser must preserve.
//
// The prompt pushes the model to pick the no-args `read_theme` tool first.
// Rerun if a recording session ends up with `read_screen` first (the bug
// only manifests on the first call's chunk shape).

function getThoughtSignature(
  providerMetadata: Record<string, Record<string, unknown>> | undefined,
): string | undefined {
  const sig =
    providerMetadata?.vertex?.thoughtSignature ??
    providerMetadata?.googleVertex?.thoughtSignature ??
    providerMetadata?.google?.thoughtSignature;
  return typeof sig === 'string' ? sig : undefined;
}

run(async () => {
  const result = streamText({
    model: googleVertex('gemini-3-flash-preview'),
    tools: {
      read_theme: tool({
        description: 'Read the current UI theme.',
        inputSchema: z.object({}),
        execute: async () => ({ '--background': '#fff' }),
      }),
      read_screen: tool({
        description: 'Read the contents of a screen by id.',
        inputSchema: z.object({ id: z.string() }),
        execute: async ({ id }) => ({ id, html: '<div/>' }),
      }),
    },
    providerOptions: {
      googleVertex: {
        streamFunctionCallArguments: true,
        thinkingConfig: { includeThoughts: true, thinkingLevel: 'medium' },
      },
    },
    prompt:
      'Read the theme, then read screens A, B, and C in parallel. Summarize.',
    includeRawChunks: true,
  });

  const toolCalls: Array<{ toolName: string; signature: string | undefined }> =
    [];

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'tool-input-start':
        console.log(`\n[tool-input-start] ${part.toolName} (${part.id})`);
        if (part.providerMetadata) {
          console.log('  providerMetadata:', part.providerMetadata);
        }
        break;
      case 'tool-input-delta':
        process.stdout.write(part.delta);
        break;
      case 'tool-input-end':
        console.log(`\n[tool-input-end] (${part.id})`);
        break;
      case 'tool-call':
        console.log(`\n[tool-call] ${part.toolName}:`, part.input);
        if (part.providerMetadata) {
          console.log('  providerMetadata:', part.providerMetadata);
        }
        toolCalls.push({
          toolName: part.toolName,
          signature: getThoughtSignature(part.providerMetadata),
        });
        break;
      case 'text-delta':
        process.stdout.write(part.text);
        break;
      case 'finish':
        console.log('\nFinish reason:', part.finishReason);
        console.log('Usage:', part.totalUsage);
        break;
      case 'error':
        console.error('Error:', part.error);
        break;
    }
  }

  // Output written to examples/ai-functions/output/<filename>.chunks.txt.
  // To regenerate the test fixture, copy it to:
  //   packages/google/src/__fixtures__/google-stream-no-args-tool-call.chunks.txt
  await saveRawChunks({
    result,
    filename: 'google-vertex-stream-tool-call-no-args',
  });

  // Verify the fix is in effect. When the bug is present, Vertex's no-args
  // chunk is dropped, taking `read_theme` and the response's only
  // thoughtSignature with it.
  const hasReadTheme = toolCalls.some(c => c.toolName === 'read_theme');
  const hasSignature = toolCalls.some(c => c.signature != null);

  if (!hasReadTheme || !hasSignature) {
    const reasons: string[] = [];
    if (!hasReadTheme) {
      reasons.push(
        '`read_theme` was not emitted (the prompt asked for it; the no-args ' +
          'chunk shape `{ functionCall: { name: "read_theme" } }` was dropped)',
      );
    }
    if (!hasSignature) {
      reasons.push(
        'no tool-call carried a `thoughtSignature` (Vertex emits exactly one ' +
          'per response, on the first function call; if that call was dropped, ' +
          'the signature went with it)',
      );
    }
    throw new Error(
      `#14847 reproduced: ${reasons.join('; and ')}.\n\n` +
        'Vertex emits a no-args function call as a single chunk shaped\n' +
        '  { functionCall: { name: "X" } }\n' +
        'with no `args`, no `partialArgs`, and no `willContinue`. The\n' +
        '@ai-sdk/google streaming parser had no branch for this shape, so the\n' +
        'chunk was silently dropped. On Gemini 3 thinking models the response\n' +
        'carries its only `thoughtSignature` on the first function call, so\n' +
        'dropping it caused the next multi-turn step to 400 with\n' +
        '`missing thought_signature`. See https://github.com/vercel/ai/issues/14847.\n\n' +
        `Tool calls observed: ${
          toolCalls.length === 0
            ? '(none)'
            : toolCalls.map(c => c.toolName).join(', ')
        }.`,
    );
  }

  console.log(
    `\nOK: emitted ${toolCalls.length} tool calls, ${
      toolCalls.filter(c => c.signature).length
    } with thoughtSignature.`,
  );
});
