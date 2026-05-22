import 'dotenv/config';
import type { GatewayProviderOptions } from '@ai-sdk/gateway';
import { stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';

/**
 * Reproduction attempt for the post-close claim on #10344:
 *
 *   hsheth2: "For me this is particularly happening when the tool call fails
 *   due to zod validation. When the tool calls succeed it does seem to pass
 *   the thought_signature properly."
 *
 * We force a tool execution failure mid-conversation and check whether the
 * next step succeeds (the SDK should still preserve the thoughtSignature on
 * the tool-call assistant message) or fails with
 *   "Function call is missing a thought_signature in functionCall parts."
 *
 * Scenarios:
 *   A) execute() throws — most common "tool call fails" path
 *   B) zod schema rejects the model's args (handled by experimental_repairToolCall? otherwise propagates)
 */
async function main() {
  const MODEL_ID = 'google/gemini-3-flash';
  const HUNT_PROMPT =
    "You're on a treasure hunt. Call the clue tool with codename 'start' first, then keep calling with each new codename you receive until you find the treasure.";

  // --- Scenario A: execute() throws on the third call ---
  console.log('=== Scenario A: execute() throws mid-chain ===\n');
  let callIndex = 0;
  const flakyClueTool = tool({
    description:
      'Follow a treasure-hunt clue. Returns the next hint, which contains the codename to pass on the next call.',
    inputSchema: z.object({
      codename: z
        .string()
        .describe(
          "Codename from the previous hint. Use 'start' on the first call.",
        ),
    }),
    execute: async ({ codename }) => {
      callIndex += 1;
      if (callIndex === 3) {
        throw new Error(
          'BOOM: simulated tool failure on the third call (codename was: ' +
            codename +
            ')',
        );
      }
      const chain: Record<string, string> = {
        start: 'Look under the doormat (codename: doormat).',
        doormat: 'Check inside the mailbox (codename: mailbox).',
        mailbox: 'Inspect the flowerpot (codename: flowerpot).',
        flowerpot: 'Lift the welcome rug (codename: rug).',
        rug: 'Search behind the picture frame (codename: frame).',
        frame: 'The treasure is in the chest!',
      };
      return { hint: chain[codename] ?? 'Unknown codename.' };
    },
  });

  try {
    const result = streamText({
      model: MODEL_ID,
      tools: { clue: flakyClueTool },
      prompt: HUNT_PROMPT,
      stopWhen: stepCountIs(10),
      providerOptions: {
        gateway: {
          only: ['google'],
        } satisfies GatewayProviderOptions,
      },
      onStepFinish: step => {
        console.log(
          `\n[step ${step.stepNumber}] finishReason=${step.finishReason} toolCalls=${step.toolCalls.length} toolResults=${step.toolResults.length}`,
        );
        const contentSummary = (step.content ?? []).map((p: any) => ({
          type: p.type,
          toolName: p.toolName,
          input: p.input ? JSON.stringify(p.input).slice(0, 60) : undefined,
          textPreview:
            p.type === 'text' && p.text ? p.text.slice(0, 60) : undefined,
          errorMsg:
            p.type === 'tool-error'
              ? (p.error?.message ?? String(p.error)).slice(0, 100)
              : undefined,
          sigPrefix: p.providerMetadata?.google?.thoughtSignature
            ? String(p.providerMetadata.google.thoughtSignature).slice(0, 12)
            : undefined,
        }));
        console.log('  content:', JSON.stringify(contentSummary));
      },
    });

    for await (const chunk of result.fullStream) {
      if (chunk.type === 'text-delta') process.stdout.write(chunk.text);
    }

    const steps = await result.steps;
    console.log(
      `\n\n✓ Scenario A completed without provider error. Steps: ${steps.length}. Tool failure was absorbed by the SDK.`,
    );
  } catch (error: any) {
    console.error('\n✗ Scenario A FAILED with provider error:');
    console.error('  statusCode:', error.statusCode);
    console.error('  message:   ', error.message);
    if (error.responseBody)
      console.error(
        '  responseBody:',
        String(error.responseBody).substring(0, 800),
      );
    if (error.data?.providerMetadata?.gateway?.routing)
      console.error(
        '  routing:',
        JSON.stringify(error.data.providerMetadata.gateway.routing, null, 2),
      );
  }
}

main().catch(error => {
  console.error('top-level error:', error.message);
  process.exit(1);
});
