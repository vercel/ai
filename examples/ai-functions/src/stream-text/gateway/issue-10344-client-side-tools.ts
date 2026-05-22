import 'dotenv/config';
import type { GatewayProviderOptions } from '@ai-sdk/gateway';
import { stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';

/**
 * Reproduction attempt for @pheuter's post-close note on #10344:
 *
 *   "Gemini 3 models require a thoughtSignature on every functionCall part
 *   when replaying conversation history. The AI SDK normally preserves this
 *   through callProviderMetadata, but it's possible in certain edge cases for
 *   clients not to store/send it back. In our codebase, it can happen with
 *   client-side tool execution."
 *
 * Client-side tool execution path:
 *   - Tool is defined WITHOUT `execute`
 *   - Turn 1: streamText returns a tool-call; the SDK does not run it
 *   - The application (the "client") runs the tool externally
 *   - Turn 2: streamText is called again with the assistant tool-call
 *     message + a tool-result message
 *
 * If the application code strips/loses providerMetadata.google.thoughtSignature
 * when reconstructing the messages, the Gemini API rejects Turn 2 with:
 *   "Function call is missing a thought_signature in functionCall parts."
 *
 * This script runs two Turn 2 variants:
 *   A) "well-behaved client": preserves providerMetadata.google.thoughtSignature
 *   B) "buggy client": strips providerMetadata before sending the next turn
 */
async function main() {
  const MODEL_ID = 'google/gemini-3-flash';

  // Tool with no `execute` — the SDK will not auto-run it. The caller
  // (this script) plays the role of the application-side executor.
  const weatherTool = tool({
    description: 'Get the weather for a location',
    inputSchema: z.object({
      location: z.string().describe('The location to get the weather for'),
    }),
    // no execute -> client-side execution
  });

  // --- Turn 1: capture a tool-call + thoughtSignature ---
  console.log('=== Turn 1: client-side tool — capture tool-call ===\n');

  const turn1 = streamText({
    model: MODEL_ID,
    tools: { weather: weatherTool },
    toolChoice: 'required',
    prompt: 'What is the weather in San Francisco? Use the weather tool.',
    stopWhen: stepCountIs(1),
    providerOptions: {
      gateway: {
        only: ['google'],
      } satisfies GatewayProviderOptions,
    },
  });

  for await (const chunk of turn1.fullStream) {
    if (chunk.type === 'text-delta') process.stdout.write(chunk.text);
  }

  const steps1 = await turn1.steps;
  const finalStep1 = steps1[steps1.length - 1];
  const turn1AssistantMessages = finalStep1.response.messages.filter(
    m => m.role === 'assistant',
  );

  let toolCallId: string | undefined;
  let toolCallInput: any;
  let toolCallSignature: string | undefined;
  for (const msg of turn1AssistantMessages) {
    if (typeof msg.content === 'string') continue;
    for (const part of msg.content) {
      if (part.type === 'tool-call') {
        toolCallId = part.toolCallId;
        toolCallInput = part.input;
        toolCallSignature = (part as any).providerOptions?.google
          ?.thoughtSignature;
      }
    }
  }

  if (!toolCallId || !toolCallSignature) {
    console.log(
      '\nTurn 1 did not produce a tool-call with signature. Cannot continue.',
    );
    console.log(
      'turn1 assistant content:',
      JSON.stringify(
        turn1AssistantMessages.map(m => m.content),
        null,
        2,
      ),
    );
    process.exit(0);
  }

  console.log(
    `\n[Turn 1] tool-call ${toolCallId} input=${JSON.stringify(toolCallInput)} sigPrefix=${toolCallSignature.substring(0, 16)}... (len=${toolCallSignature.length})`,
  );

  // --- Application-side tool execution ---
  const toolResultValue = {
    location: 'San Francisco',
    temperature: 72,
    condition: 'sunny',
  };
  console.log(
    `[client] executed tool externally, result: ${JSON.stringify(toolResultValue)}`,
  );

  const buildHistory = (preserveSignature: boolean) => [
    {
      role: 'user' as const,
      content: 'What is the weather in San Francisco? Use the weather tool.',
    },
    {
      role: 'assistant' as const,
      content: [
        {
          type: 'tool-call' as const,
          toolCallId: toolCallId!,
          toolName: 'weather',
          input: toolCallInput,
          ...(preserveSignature
            ? {
                providerOptions: {
                  google: { thoughtSignature: toolCallSignature! },
                },
              }
            : {}),
        },
      ],
    },
    {
      role: 'tool' as const,
      content: [
        {
          type: 'tool-result' as const,
          toolCallId: toolCallId!,
          toolName: 'weather',
          output: { type: 'json' as const, value: toolResultValue },
        },
      ],
    },
  ];

  const runTurn = async (label: string, preserveSignature: boolean) => {
    const result = streamText({
      model: MODEL_ID,
      tools: { weather: weatherTool },
      messages: buildHistory(preserveSignature),
      stopWhen: stepCountIs(1),
      providerOptions: {
        gateway: {
          only: ['google'],
        } satisfies GatewayProviderOptions,
      },
    });

    let streamError: any;
    for await (const chunk of result.fullStream) {
      if (chunk.type === 'text-delta') process.stdout.write(chunk.text);
      if (chunk.type === 'error') streamError = chunk.error;
    }

    if (streamError) {
      const e: any = streamError;
      console.error(`\n✗ ${label} FAILED:`);
      console.error('  statusCode:', e.statusCode);
      console.error('  message:   ', e.message);
      if (e.responseBody) {
        const body = String(e.responseBody);
        const match = body.match(
          /thought_signature[^"]*missing[^"]*functionCall parts[^"]*/i,
        );
        if (match)
          console.error(
            '  matched bug signature: ' + match[0].slice(0, 120) + '...',
          );
        else console.error('  responseBody:', body.slice(0, 400));
      }
      return false;
    }
    console.log(`\n\n✓ ${label} succeeded.`);
    return true;
  };

  // --- Turn 2A: well-behaved client (signature preserved) ---
  console.log(
    '\n=== Turn 2A: well-behaved client — signature preserved on tool-call ===\n',
  );
  const okA = await runTurn('Turn 2A (signature preserved)', true);

  // --- Turn 2B: buggy client (signature stripped) ---
  console.log(
    '\n=== Turn 2B: buggy client — providerMetadata stripped from tool-call ===',
  );
  console.log(
    '  Expectation: Gemini rejects with HTTP 400 "missing thought_signature".\n',
  );
  const okB = await runTurn('Turn 2B (signature stripped)', false);

  console.log('\n--- Summary ---');
  console.log(
    `  Turn 2A (well-behaved): ${okA ? 'succeeded ✓ (expected)' : 'failed ✗ (unexpected)'}`,
  );
  console.log(
    `  Turn 2B (signature stripped): ${okB ? 'succeeded — bug NOT reproduced' : 'failed with 400 ✓ — bug reproduced (expected)'}`,
  );
}

main().catch(error => {
  console.error('top-level error:', error.message);
  if (error.responseBody)
    console.error('  responseBody:', String(error.responseBody).slice(0, 500));
  process.exit(1);
});
