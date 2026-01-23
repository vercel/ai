import { createVertex } from '@ai-sdk/google-vertex';
import { generateText, streamText } from 'ai';
import { run } from '../lib/run';

// Test Gemini 3 and 2.x models for logprobs support
const models = [
  'gemini-3-pro-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
];

run(async () => {
  const vertex = createVertex();

  console.log('=== Testing generateText with logprobs ===\n');

  for (const modelName of models) {
    console.log(`\n--- ${modelName} ---`);
    try {
      const result = await generateText({
        model: vertex(modelName),
        prompt: 'Say hi.',
        temperature: 0,
        providerOptions: {
          vertex: {
            responseLogprobs: true,
            logprobs: 5,
          },
        },
      });

      const logprobs = result.providerMetadata?.vertex?.logprobsResult;
      const avgLogprobs = result.providerMetadata?.vertex?.avgLogprobs;

      if (logprobs) {
        console.log(`  ✅ generateText: logprobs supported`);
        console.log(`     avgLogprobs: ${avgLogprobs}`);
      } else {
        console.log(`  ⚠️  generateText: no logprobs in response`);
      }
    } catch (e: unknown) {
      const error = e as Error;
      const msg = error.message?.slice(0, 80) || 'Unknown error';
      console.log(`  ❌ generateText: ${msg}...`);
    }

    // Test streaming
    try {
      const streamResult = streamText({
        model: vertex(modelName),
        prompt: 'Say bye.',
        temperature: 0,
        providerOptions: {
          vertex: {
            responseLogprobs: true,
            logprobs: 5,
          },
        },
      });

      let text = '';
      for await (const chunk of streamResult.textStream) {
        text += chunk;
      }

      const metadata = await streamResult.providerMetadata;
      const logprobs = metadata?.vertex?.logprobsResult;

      if (logprobs) {
        console.log(`  ✅ streamText: logprobs supported`);
      } else {
        console.log(`  ⚠️  streamText: completed but no logprobs`);
      }
    } catch (e: unknown) {
      const error = e as Error;
      if (error.message?.includes('response_logprobs')) {
        console.log(`  ❌ streamText: logprobs not supported`);
      } else {
        const msg = error.message?.slice(0, 60) || 'Unknown error';
        console.log(`  ❌ streamText: ${msg}...`);
      }
    }
  }

  console.log('\n=== Summary ===');
  console.log('generateText: Generally supported for logprobs');
  console.log('streamText: Model-dependent (may not be supported)');
});
