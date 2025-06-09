import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import 'dotenv/config';

async function main() {
  const pdfPath = resolve(process.cwd(), 'data', 'ai.pdf');
  const pdfBuffer = readFileSync(pdfPath);
  const pdfBase64 = pdfBuffer.toString('base64');

  const result = await generateText({
    model: anthropic('claude-3-5-sonnet-20241022'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What does this document contain? Please provide citations for your analysis.',
          },
          {
            type: 'file',
            data: `data:application/pdf;base64,${pdfBase64}`,
            mediaType: 'application/pdf',
            filename: 'ai.pdf',
            providerOptions: {
              anthropic: {
                citations: { enabled: true },
                title: 'AI Research Document',
                context:
                  'Technical documentation about artificial intelligence',
              },
            },
          },
        ],
      },
    ],
  });

  console.log('Response:');
  console.log(result.text);

  console.log('\nExample demonstrates:');
  console.log('- File part level provider options for documents');
  console.log('- Custom title and context for the document');
  console.log('- Citations enabled on the document');
  console.log(
    '\nNote: Anthropic citations currently only work with PDF files.',
  );
}

main().catch(console.error);
