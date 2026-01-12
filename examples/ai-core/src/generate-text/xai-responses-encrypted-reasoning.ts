import { xai } from '@ai-sdk/xai';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  console.log('Testing encrypted reasoning with generateText...\n');

  const models = ['grok-code-fast-1', 'grok-4-1-fast-reasoning'];

  for (const modelId of models) {
    console.log(`\n=== ${modelId} ===\n`);

    const result = await generateText({
      model: xai.responses(modelId as any),
      prompt: 'What is 2+2? Think carefully.',
      providerOptions: {
        xai: {
          store: false, // Required to get encrypted_content
        },
      },
    });

    console.log('Text:', result.text);
    console.log('\nUsage:');
    console.log('  - Input tokens:', result.usage.inputTokens);
    console.log('  - Output tokens:', result.usage.outputTokens);
    console.log('  - Reasoning tokens:', result.usage.reasoningTokens);

    // Access encrypted reasoning content from content parts via providerMetadata
    const reasoningParts = result.content.filter(
      (part: any) => part.type === 'reasoning',
    );

    console.log('\nReasoning:');
    console.log('  - Parts found:', reasoningParts.length);

    if (reasoningParts.length > 0) {
      const reasoning = reasoningParts[0];
      const xaiMetadata = reasoning.providerMetadata?.xai;
      console.log('  - Summary length:', reasoning.text?.length || 0);
      console.log('  - Item ID:', xaiMetadata?.itemId);
      console.log(
        '  - Encrypted content length:',
        xaiMetadata?.reasoningEncryptedContent?.length || 0,
      );
      console.log(
        '  - Has encrypted content:',
        !!xaiMetadata?.reasoningEncryptedContent,
      );

      if (xaiMetadata?.reasoningEncryptedContent) {
        console.log(
          '  - Encrypted content (first 100 chars):',
          xaiMetadata.reasoningEncryptedContent.substring(0, 100) + '...',
        );
      }
    }
  }

  console.log('\n✓ Successfully retrieved encrypted reasoning content!');
});
