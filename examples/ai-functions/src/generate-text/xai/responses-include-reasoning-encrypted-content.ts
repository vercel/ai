import { xai, type XaiLanguageModelResponsesOptions } from '@ai-sdk/xai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

// Test that we can explicitly pass include: ['reasoning.encrypted_content']
// This verifies the schema change allows this value
run(async () => {
  console.log(
    'Testing explicit include option with reasoning.encrypted_content...\n',
  );

  const result = await generateText({
    model: xai.responses('grok-4-1-fast-reasoning'),
    prompt: 'How many "r"s are in the word "strawberry"',
    providerOptions: {
      xai: {
        store: false,
        // Explicitly passing include - this would fail before the schema fix
        include: ['reasoning.encrypted_content'],
      } satisfies XaiLanguageModelResponsesOptions,
    },
  });

  console.log('✅ Schema validation passed!\n');
  console.log('Text:', result.text);
  console.log('Usage:', result.usage);

  const reasoningParts = result.content.filter(
    part => part.type === 'reasoning',
  );

  if (reasoningParts.length > 0) {
    const reasoning = reasoningParts[0];
    const xaiMetadata = reasoning.providerMetadata?.xai as {
      reasoningEncryptedContent?: string;
    };
    console.log(
      '\nReasoning encrypted content received:',
      !!xaiMetadata?.reasoningEncryptedContent,
    );
    if (xaiMetadata?.reasoningEncryptedContent) {
      console.log(
        'Encrypted content length:',
        xaiMetadata.reasoningEncryptedContent.length,
      );
    }
  }
});
