import { bedrock } from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';
import 'dotenv/config';
import { BedrockCitation } from '../../../../packages/amazon-bedrock/src/bedrock-api-types';

async function main() {
  const result = await generateText({
    model: bedrock('anthropic.claude-3-7-sonnet-20250219-v1:0'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What color is the grass? Use citations.',
          },
          {
            type: 'file',
            mediaType: 'text/plain',
            data: 'The grass is green in spring and summer. The sky is blue during clear weather.',
            providerOptions: {
              bedrock: {
                citations: { enabled: true },
              },
            },
          },
        ],
      },
    ],
  });

  console.log('Response:', result.text);

  const citations = result.content.filter(part => part.type === 'source');
  citations.forEach((citation, i) => {
    if (
      citation.sourceType === 'document' &&
      citation.providerMetadata?.bedrock
    ) {
      const metaCitation = citation.providerMetadata.bedrock
        .citation as BedrockCitation;
      if (!metaCitation) {
        return;
      }

      const citedText = metaCitation.sourceContent?.[0]?.text ?? 'N/A';
      const location =
        metaCitation.location?.documentChar ||
        metaCitation.location?.documentPage;
      const startIdx = location?.start ?? 'N/A';
      const endIdx = location?.end ?? 'N/A';
      console.log(`\n[${i + 1}] "${citedText}" (chars: ${startIdx}-${endIdx})`);
    }
  });
}

main().catch(console.error);
