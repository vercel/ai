import { createGoogle } from '@ai-sdk/google';
import { generateText, isStepCount, tool } from 'ai';
import { z } from 'zod';

const pdfBase64 =
  'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyA+PgplbmRvYmoKeHJlZgowIDIKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjU4CiUlRU9G';

async function main() {
  const requests: Array<{ url: string; body: any }> = [];
  const google = createGoogle({
    fetch: async (input, init) => {
      requests.push({
        url: String(input),
        body:
          typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      });

      return fetch(input, init);
    },
  });

  await generateText({
    model: google('gemini-2.5-flash-lite'),
    maxOutputTokens: 64,
    prompt:
      'Call the catalogSearch tool, then answer briefly based on the tool result.',
    tools: {
      catalogSearch: tool({
        description: 'Return catalog PDF metadata and document data.',
        inputSchema: z.object({}),
        execute: async () => ({ ok: true }),
        toModelOutput: () => ({
          type: 'content',
          value: [
            { type: 'text', text: 'metadata' },
            {
              type: 'file-data',
              data: pdfBase64,
              mediaType: 'application/pdf',
            } as any,
          ],
        }),
      }),
    },
    toolChoice: { type: 'tool', toolName: 'catalogSearch' },
    stopWhen: isStepCount(2),
  });

  const secondRequest = requests[1]?.body;
  const toolResultParts =
    secondRequest?.contents?.find(
      (content: any) =>
        content.role === 'user' &&
        content.parts?.some((part: any) => part.functionResponse != null),
    )?.parts ?? [];
  const pdfTextPart = toolResultParts.find(
    (part: any) =>
      typeof part.text === 'string' && part.text.includes(pdfBase64),
  );

  console.log(
    JSON.stringify(
      {
        requestCount: requests.length,
        observedToolResultParts: toolResultParts,
      },
      null,
      2,
    ),
  );

  if (pdfTextPart != null) {
    throw new Error(
      'Reproduced issue #16072: PDF file tool result was serialized as a JSON text part instead of file/document data.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
