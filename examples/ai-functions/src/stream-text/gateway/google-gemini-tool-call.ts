import 'dotenv/config';
import { google } from '@ai-sdk/google';
import { stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';

/**
 * Repro for https://github.com/vercel/ai/issues/11413
 *
 * Simulates a gateway cross-provider failover scenario:
 *   Turn 1: Vertex AI handles the request (thoughtSignature stored under "vertex" key)
 *   Turn 2: Fails over to Google AI Studio (looks for thoughtSignature under "google" key)
 *
 * The Google provider's convertToGoogleGenerativeAIMessages only checks:
 *   1. providerOptions[providerOptionsName] (e.g. "google")
 *   2. Falls back to providerOptions.google only when providerOptionsName !== "google"
 *
 * So when providerOptionsName is "google" and the data is under "vertex", the
 * thoughtSignature is silently dropped, causing the API error.
 *
 * We test three scenarios:
 *   A) Normal: thoughtSignature under "google" key (works)
 *   B) Failover: thoughtSignature under "vertex" key only (signature dropped → API warning)
 *   C) Wrong signature: an invalid signature under "google" key (→ API error)
 */
async function main() {
  console.log('Issue #11413: Simulating gateway cross-provider failover\n');

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

  // Verify thoughtSignature is present
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
    console.log('\nTurn 1 did not produce thoughtSignature — cannot reproduce');
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
          if (part.providerOptions?.google) {
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

  console.log('Messages rewritten: providerOptions "google" → "vertex"');
  console.log(
    'Google provider will NOT find thoughtSignature (only checks "google" key)\n',
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

    console.log(
      '\n⚠ Scenario B: API accepted request with missing thoughtSignature',
    );
    console.log(
      '  (Google warns this may lead to degraded model performance)\n',
    );
  } catch (error: any) {
    console.error('\n✗ Scenario B FAILED:');
    console.error('  Error:', error.message?.substring(0, 200));
    console.log();
  }

  // --- Scenario C: Wrong signature — an invalid signature under "google" key ---
  console.log(
    '=== Scenario C: Invalid signature — dummy value under "google" key ===\n',
  );

  const invalidSigMessages = response1.messages.map(msg => {
    if (
      (msg.role === 'assistant' || msg.role === 'tool') &&
      typeof msg.content !== 'string'
    ) {
      return {
        ...msg,
        content: msg.content.map(part => {
          if (part.providerOptions?.google?.thoughtSignature) {
            return {
              ...part,
              providerOptions: {
                ...part.providerOptions,
                google: {
                  ...part.providerOptions.google,
                  thoughtSignature: 'INVALID_SIGNATURE_FROM_DIFFERENT_PROVIDER',
                },
              },
            };
          }
          return part;
        }),
      };
    }
    return msg;
  });

  console.log(
    'Messages modified: thoughtSignature replaced with invalid value\n',
  );

  let scenarioCError: any = null;
  const scenarioC = streamText({
    model: google('gemini-3.1-pro-preview'),
    tools: { weather: weatherTool },
    messages: [
      { role: 'user', content: 'What is the weather in San Francisco?' },
      ...(invalidSigMessages as any),
      { role: 'user', content: 'What about New York?' },
    ],
    stopWhen: stepCountIs(2),
    onError: ({ error }) => {
      scenarioCError = error;
    },
  });

  for await (const chunk of scenarioC.fullStream) {
    if (chunk.type === 'text-delta') {
      process.stdout.write(chunk.text);
    }
  }

  if (scenarioCError) {
    const msg = String(
      scenarioCError?.responseBody ?? scenarioCError?.message ?? scenarioCError,
    );
    console.error('✗ Scenario C FAILED with thought_signature error:');
    console.error(`  Status: ${scenarioCError.statusCode ?? 'unknown'}`);
    if (msg.includes('thought_signature')) {
      console.error(
        '  Error: Invalid/incompatible thought_signature rejected by API',
      );
      console.error(
        '\n  This confirms issue #11413: when the gateway fails over from',
      );
      console.error(
        '  Vertex to Google AI Studio, an incompatible signature causes a 400 error.',
      );
    } else {
      console.error('  Error:', msg.substring(0, 200));
    }
  } else {
    console.log(
      '\n⚠ Scenario C succeeded — API accepted invalid thoughtSignature',
    );
  }
  console.log();
}

main().catch(console.error);
