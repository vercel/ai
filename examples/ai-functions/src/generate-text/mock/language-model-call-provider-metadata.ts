import { generateText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { run } from '../../lib/run';

run(async () => {
  const { text } = await generateText({
    model: new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: 'text', text: 'Tenrecs live in Madagascar.' }],
        finishReason: { raw: 'stop', unified: 'stop' },
        providerMetadata: {
          gateway: { generationId: 'generation-id' },
        },
        usage: {
          inputTokens: {
            total: 10,
            noCache: 10,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: 6,
            text: 6,
            reasoning: undefined,
          },
        },
        warnings: [],
      }),
    }),
    prompt: 'Name one interesting fact about tenrecs.',
    onLanguageModelCallEnd({ providerMetadata }) {
      console.log(
        'Model-call provider metadata:',
        JSON.stringify(providerMetadata, null, 2),
      );
    },
  });

  console.log('Response:', text);
});
