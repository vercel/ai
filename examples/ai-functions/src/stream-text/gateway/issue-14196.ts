import 'dotenv/config';
import type { GatewayProviderOptions } from '@ai-sdk/gateway';
import { stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';

/**
 * Reproduction for https://github.com/vercel/ai/issues/14196
 *
 * AI Gateway: Vertex rejects thought signatures from Google AI Studio on
 * mid-conversation failover.
 *
 * Bug scenario (as reported):
 *   1. Gateway is configured with order: ['google','vertex']
 *   2. Turn 1..10 succeed on Google AI Studio (model: google/gemini-3-flash).
 *      Assistant messages carry a `thoughtSignature` issued by Google AI
 *      Studio, stored under `providerOptions.google`.
 *   3. Turn 11: Google AI Studio returns 503. Gateway fails over to Vertex.
 *   4. Vertex receives the same conversation with the Google-AI-Studio
 *      signature and returns 400:
 *        "Unable to submit request because Thought signature is not valid."
 *
 * This script reproduces by driving everything through the AI Gateway:
 *   Turn 1: gateway → only:['google']  — gets real signatures via Google AI Studio.
 *   Turn 2: gateway → only:['vertex']  — simulates the failover; Vertex receives
 *                                        the Google-AI-Studio signatures.
 *   Turn 3: gateway → order:['google','vertex'] — sanity check; succeeds because
 *                                        Google AI Studio is healthy in this run.
 */
async function main() {
  const MODEL_ID = 'google/gemini-3-flash';

  const nextClue: Record<string, { hint: string; final?: boolean }> = {
    start: { hint: 'Look under the doormat (codename: doormat).' },
    doormat: { hint: 'Check inside the mailbox (codename: mailbox).' },
    mailbox: { hint: 'Inspect the flowerpot (codename: flowerpot).' },
    flowerpot: { hint: 'Lift the welcome rug (codename: rug).' },
    rug: { hint: 'Search behind the picture frame (codename: frame).' },
    frame: { hint: 'Open the desk drawer (codename: drawer).' },
    drawer: { hint: 'Read the diary on the shelf (codename: diary).' },
    diary: { hint: 'Peek inside the wardrobe (codename: wardrobe).' },
    wardrobe: { hint: 'Climb to the attic (codename: attic).' },
    attic: { hint: 'The treasure is in the chest!', final: true },
  };
  const clueTool = tool({
    description:
      'Follow a treasure-hunt clue. Returns the next hint, which contains the codename to pass on the next call.',
    inputSchema: z.object({
      codename: z
        .string()
        .describe(
          "Codename from the previous hint. Use 'start' on the first call.",
        ),
    }),
    execute: async ({ codename }) =>
      nextClue[codename] ?? {
        hint: 'Unknown codename — start over with "start".',
      },
  });

  const HUNT_PROMPT =
    "Follow the treasure-hunt clues. Start with codename 'start'. After each tool result, call the clue tool again with the new codename. Keep going until you find the treasure.";

  // --- Turn 1: Gateway → only:['google'] ---
  console.log('=== Turn 1: gateway only:["google"] ===\n');

  const turn1 = streamText({
    model: MODEL_ID,
    tools: { clue: clueTool },
    prompt: HUNT_PROMPT,
    stopWhen: stepCountIs(12),
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
  // On release-v6.0, `step.response.messages` is cumulative across the chain,
  // so take just the last step's messages to get the conversation once.
  const response1Messages = finalStep1.response.messages;
  console.log(
    '\n\n[Turn 1] gateway routing:',
    JSON.stringify(finalStep1.providerMetadata?.gateway?.routing, null, 2),
  );

  let signatureCount = 0;
  const signatureNamespaces = new Set<string>();
  for (const msg of response1Messages) {
    if (msg.role === 'assistant' && typeof msg.content !== 'string') {
      for (const part of msg.content) {
        const opts: any = (part as any).providerOptions;
        if (!opts) continue;
        for (const ns of Object.keys(opts)) {
          if (opts[ns]?.thoughtSignature) {
            signatureCount += 1;
            signatureNamespaces.add(ns);
            const sig = String(opts[ns].thoughtSignature);
            console.log(
              `[Turn 1] ${(part as any).type} thoughtSignature #${signatureCount} under [${ns}]: ${sig.substring(0, 32)}... (len=${sig.length})`,
            );
          }
        }
      }
    }
  }
  console.log(
    `\n[Turn 1] total signatures captured: ${signatureCount} under namespaces [${[...signatureNamespaces].join(', ')}]`,
  );
  if (signatureCount === 0) {
    console.log(
      '\nTurn 1 produced no thoughtSignature — Gateway probably routed away from google. Aborting.',
    );
    process.exit(0);
  }

  // --- Turn 2: Gateway → only:['vertex'] (the failover simulation) ---
  console.log(
    '\n=== Turn 2: gateway only:["vertex"] — simulating failover from google to vertex ===\n',
  );

  try {
    const turn2 = streamText({
      model: MODEL_ID,
      tools: { clue: clueTool },
      messages: [
        { role: 'user', content: HUNT_PROMPT },
        ...response1Messages,
        { role: 'user', content: 'Summarize the trail you followed.' },
      ],
      stopWhen: stepCountIs(2),
      providerOptions: {
        gateway: {
          only: ['vertex'],
        } satisfies GatewayProviderOptions,
      },
    });

    for await (const chunk of turn2.fullStream) {
      if (chunk.type === 'text-delta') process.stdout.write(chunk.text);
    }

    const steps2 = await turn2.steps;
    const finalStep2 = steps2[steps2.length - 1];
    console.log(
      '\n\n[Turn 2] gateway routing:',
      JSON.stringify(finalStep2.providerMetadata?.gateway?.routing, null, 2),
    );
    console.log(
      '\n✓ Turn 2 succeeded — Vertex accepted Google AI Studio signatures via Gateway (bug NOT reproduced).',
    );
  } catch (error: any) {
    console.error(
      '\n✗ Turn 2 FAILED (matches #14196 if "Thought signature is not valid"):',
    );
    console.error('  statusCode:', error.statusCode);
    console.error('  message:   ', error.message);
    if (error.responseBody) {
      console.error(
        '  responseBody:',
        String(error.responseBody).substring(0, 800),
      );
    }
    if (error.data?.providerMetadata?.gateway?.routing) {
      console.error(
        '  gateway routing:',
        JSON.stringify(error.data.providerMetadata.gateway.routing, null, 2),
      );
    }
  }

  // --- Turn 3: Gateway → order:['google','vertex'] (the reporter's exact config) ---
  console.log(
    '\n=== Turn 3: gateway order:["google","vertex"] (reporter\'s config) ===\n',
  );

  try {
    const turn3 = streamText({
      model: MODEL_ID,
      tools: { clue: clueTool },
      messages: [
        { role: 'user', content: HUNT_PROMPT },
        ...response1Messages,
        { role: 'user', content: 'Summarize the trail you followed.' },
      ],
      stopWhen: stepCountIs(2),
      providerOptions: {
        gateway: {
          order: ['google', 'vertex'],
        } satisfies GatewayProviderOptions,
      },
    });

    for await (const chunk of turn3.fullStream) {
      if (chunk.type === 'text-delta') process.stdout.write(chunk.text);
    }

    const steps3 = await turn3.steps;
    const finalStep3 = steps3[steps3.length - 1];
    console.log(
      '\n\n[Turn 3] gateway routing:',
      JSON.stringify(finalStep3.providerMetadata?.gateway?.routing, null, 2),
    );
    console.log('\n✓ Turn 3 succeeded via Gateway with order.');
  } catch (error: any) {
    console.error('\n✗ Turn 3 FAILED:');
    console.error('  statusCode:', error.statusCode);
    console.error('  message:   ', error.message);
    if (error.responseBody)
      console.error(
        '  responseBody:',
        String(error.responseBody).substring(0, 800),
      );
    if (error.data?.providerMetadata?.gateway?.routing) {
      console.error(
        '  gateway routing:',
        JSON.stringify(error.data.providerMetadata.gateway.routing, null, 2),
      );
    }
  }
}

main().catch(error => {
  console.error('top-level error:', error.message);
  if (error.statusCode) console.error('  statusCode:', error.statusCode);
  if (error.responseBody)
    console.error(
      '  responseBody:',
      String(error.responseBody).substring(0, 800),
    );
  process.exit(1);
});
