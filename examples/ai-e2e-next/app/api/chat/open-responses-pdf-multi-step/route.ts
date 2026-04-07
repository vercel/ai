import { createOpenResponses } from '@ai-sdk/open-responses';
import {
  convertToModelMessages,
  isStepCount,
  streamText,
  tool,
  UIMessage,
} from 'ai';
import { z } from 'zod';

export const maxDuration = 60;

const openResponses = createOpenResponses({
  name: 'openai',
  url: 'https://api.openai.com/v1/responses',
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: openResponses('gpt-4.1-mini'),
    messages: await convertToModelMessages(messages),
    tools: {
      summarizeSection: tool({
        description:
          'Summarize a specific section of the document. Use this tool when the user asks for a summary or key points.',
        inputSchema: z.object({
          sectionName: z
            .string()
            .describe('The name or topic of the section to summarize'),
        }),
        execute: async ({ sectionName }) => ({
          summary: `Summary of "${sectionName}" section extracted from the document.`,
        }),
      }),
      extractKeyTerms: tool({
        description:
          'Extract key terms and definitions from the document. Use this when the user asks about terminology or definitions.',
        inputSchema: z.object({
          topic: z.string().describe('The topic area to extract terms for'),
        }),
        execute: async ({ topic }) => ({
          terms: [
            { term: `${topic} term 1`, definition: 'Definition 1' },
            { term: `${topic} term 2`, definition: 'Definition 2' },
          ],
        }),
      }),
    },
    stopWhen: isStepCount(5),
  });

  return result.toUIMessageStreamResponse();
}
