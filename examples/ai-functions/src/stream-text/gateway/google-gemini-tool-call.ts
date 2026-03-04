import 'dotenv/config';
import { google } from '@ai-sdk/google';
import { stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';

/**
 * Verification for https://github.com/vercel/ai/issues/11413
 *
 * Simulates a gateway cross-provider failover scenario:
 *   Turn 1: Vertex AI handles the request (thoughtSignature stored under "vertex" key)
 *   Turn 2: Fails over to Google AI Studio (looks for thoughtSignature under "google" key)
 *
 * The fix makes convertToGoogleGenerativeAIMessages check both namespaces:
 *   - Primary: providerOptions[providerOptionsName] (e.g. "google")
 *   - Fallback: providerOptions.vertex (when providerOptionsName === "google")
 *             or providerOptions.google (when providerOptionsName === "vertex")
 *
 * We test two scenarios:
 *   A) Normal: thoughtSignature under "google" key (works)
 *   B) Failover: thoughtSignature under "vertex" key only (now works with fix)
 */
async function main() {
  console.log('Issue #11413: Verifying gateway cross-provider failover fix\n');

  const weatherTool = tool({
    description: 'Get the weather for a location',
    inputSchema: z.object({
      location: z.string().describe('The location to get weather for'),
    }),
    execute: async ({ location }) => ({
      location,
      temperature: 72,
      condition: 'sunny',
    }),
  });

  // --- Turn 1: Get a real response with thoughtSignature ---
  console.log('=== Turn 1: Get response with thoughtSignature ===\n');

  const turn1 = streamText({
    model: google('gemini-3.1-pro-preview'),
    tools: { weather: weatherTool },
    prompt: 'What is the weather in San Francisco?',
    stopWhen: stepCountIs(2),
  });

  for await (const chunk of turn1.fullStream) {
    if (chunk.type === 'text-delta') {
      process.stdout.write(chunk.text);
    }
  }

  const response1 = await turn1.response;

  let hasThoughtSignature = false;
  for (const msg of response1.messages) {
    if (msg.role === 'assistant' && typeof msg.content !== 'string') {
      for (const part of msg.content) {
        if (
          part.type === 'tool-call' &&
          part.providerOptions?.google?.thoughtSignature
        ) {
          hasThoughtSignature = true;
          const sig = String(part.providerOptions.google.thoughtSignature);
          console.log(
            `\nTurn 1 tool-call thoughtSignature: ${sig.substring(0, 40)}... (${sig.length} chars)`,
          );
        }
      }
    }
  }
  if (!hasThoughtSignature) {
    console.log(
      '\nTurn 1 did not produce thoughtSignature — cannot test failover',
    );
    process.exit(0);
  }

  // --- Scenario A: Normal (thoughtSignature under "google" key) ---
  console.log(
    '\n\n=== Scenario A: Normal — thoughtSignature under "google" key ===\n',
  );

  try {
    const scenarioA = streamText({
      model: google('gemini-3.1-pro-preview'),
      tools: { weather: weatherTool },
      messages: [
        { role: 'user', content: 'What is the weather in San Francisco?' },
        ...response1.messages,
        { role: 'user', content: 'What about New York?' },
      ],
      stopWhen: stepCountIs(2),
    });

    for await (const chunk of scenarioA.fullStream) {
      if (chunk.type === 'text-delta') {
        process.stdout.write(chunk.text);
      }
    }

    console.log('\n✓ Scenario A succeeded (expected)\n');
  } catch (error: any) {
    console.error('\n✗ Scenario A FAILED (unexpected):', error.message);
  }

  // --- Scenario B: Failover — thoughtSignature under "vertex" key only ---
  console.log(
    '=== Scenario B: Failover — thoughtSignature under "vertex" key only ===\n',
  );

  const rewrittenMessages = response1.messages.map(msg => {
    if (
      (msg.role === 'assistant' || msg.role === 'tool') &&
      typeof msg.content !== 'string'
    ) {
      return {
        ...msg,
        content: msg.content.map(part => {
          if ('providerOptions' in part && part.providerOptions?.google) {
            const { google: googleOpts, ...rest } = part.providerOptions;
            return {
              ...part,
              providerOptions: { ...rest, vertex: googleOpts },
            };
          }
          return part;
        }),
      };
    }
    return msg;
  });

  console.log(
    'Messages rewritten: providerOptions "google" → "vertex" (simulates Vertex→Google failover)',
  );
  console.log(
    'Google provider should find thoughtSignature via vertex fallback\n',
  );

  try {
    const scenarioB = streamText({
      model: google('gemini-3.1-pro-preview'),
      tools: { weather: weatherTool },
      messages: [
        { role: 'user', content: 'What is the weather in San Francisco?' },
        ...(rewrittenMessages as any),
        { role: 'user', content: 'What about New York?' },
      ],
      stopWhen: stepCountIs(2),
    });

    for await (const chunk of scenarioB.fullStream) {
      if (chunk.type === 'text-delta') {
        process.stdout.write(chunk.text);
      }
    }

    console.log('\n✓ Scenario B succeeded — fix verified!\n');
  } catch (error: any) {
    console.error('\n✗ Scenario B FAILED:');
    console.error('  Error:', error.message?.substring(0, 200));
    console.error(
      '\n  The fix did not work — thoughtSignature was not resolved from vertex namespace.',
    );
    console.log();
  }
}

main().catch(console.error);
