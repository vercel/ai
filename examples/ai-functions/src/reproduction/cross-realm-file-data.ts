// Offline reproduction: binary data created in another JavaScript realm must
// keep its bytes and view bounds when passed through the public SDK.
import { convertToBase64 } from '@ai-sdk/provider-utils';
import { generateText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import vm from 'node:vm';
import { run } from '../lib/run';

run(async () => {
  const data: Uint8Array = vm.runInNewContext(
    'new Uint8Array([0, 1, 2, 3, 4]).subarray(1, 4)',
  );
  console.log('Cross-realm instanceof:', data instanceof Uint8Array);
  console.log('Base64:', convertToBase64(data));

  const model = new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text: 'OK' }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: {
          total: 1,
          noCache: 1,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
      },
      warnings: [],
    },
  });
  const result = await generateText({
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'file', data, mediaType: 'application/octet-stream' },
        ],
      },
    ],
    maxRetries: 0,
  });
  console.log('Provider prompt:', model.doGenerateCalls[0].prompt);
  console.log('Result:', result.text);
});
