import { xai } from '@ai-sdk/xai';
import { streamText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  console.log('Testing encrypted reasoning with streamText...\n');

  const models = ['grok-code-fast-1', 'grok-4-1-fast-reasoning'];

  for (const modelId of models) {
    console.log(`\n=== ${modelId} ===\n`);

    const result = streamText({
      model: xai.responses(modelId as any),
      prompt: 'What is 2+2? Think carefully.',
      providerOptions: {
        xai: {
          store: false, // Required to get encrypted_content
        },
      },
    });

    let textContent = '';
    let reasoningSummary = '';
    let encryptedContent: string | null = null;
    let itemId: string | undefined;

    for await (const part of result.fullStream) {
      // Collect text content
      if (part.type === 'text-delta') {
        textContent += (part as any).text || '';
      }

      // Collect reasoning summary and encrypted content from providerMetadata
      if (part.type === 'reasoning-delta') {
        reasoningSummary += (part as any).text || '';
      }

      // Extract encrypted content from reasoning-end event
      if (part.type === 'reasoning-end') {
        const xaiMetadata = (part as any).providerMetadata?.xai;
        if (xaiMetadata) {
          encryptedContent = xaiMetadata.reasoningEncryptedContent;
          itemId = xaiMetadata.itemId;
        }
      }
    }

    console.log('Text:', textContent);

    const usage = await result.usage;
    console.log('\nUsage:');
    console.log('  - Input tokens:', usage.inputTokens);
    console.log('  - Output tokens:', usage.outputTokens);
    console.log('  - Reasoning tokens:', usage.reasoningTokens);

    console.log('\nReasoning:');
    console.log('  - Summary length:', reasoningSummary.length);
    console.log('  - Item ID:', itemId);
    console.log('  - Encrypted content length:', encryptedContent?.length || 0);
    console.log('  - Has encrypted content:', !!encryptedContent);

    if (encryptedContent) {
      console.log(
        '  - Encrypted content (first 100 chars):',
        encryptedContent.substring(0, 100) + '...',
      );
    }
  }

  console.log('\n✓ Successfully retrieved encrypted reasoning content!');
});
