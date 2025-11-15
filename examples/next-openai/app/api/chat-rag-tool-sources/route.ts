import { google } from '@ai-sdk/google';
import { convertToModelMessages, stepCountIs, streamText, tool, validateUIMessages } from 'ai';
import { z } from 'zod';

export const maxDuration = 30;

// Simulated knowledge base - in a real application, this would be a vector database
const knowledgeBase = [
  {
    id: 'doc-1',
    title: 'Introduction to AI',
    url: 'https://example.com/intro-to-ai',
    content:
      'Artificial Intelligence (AI) is the simulation of human intelligence processes by machines.',
  },
  {
    id: 'doc-2',
    title: 'Machine Learning Guide',
    url: 'https://example.com/ml-guide',
    content:
      'Machine Learning is a subset of AI that enables systems to learn from data without explicit programming.',
  },
  {
    id: 'doc-3',
    title: 'Neural Networks Overview',
    url: 'https://example.com/neural-networks',
    content:
      'Neural networks are computing systems inspired by biological neural networks.',
  },
  {
    id: 'doc-4',
    title: 'Deep Learning Fundamentals',
    url: 'https://example.com/deep-learning',
    content:
      'Deep Learning uses multi-layered neural networks to progressively extract higher-level features.',
  },
];

const searchKnowledge = tool({
  description:
    'Search the knowledge base for relevant information. Use this tool to find accurate, sourced information to answer user questions.',
  inputSchema: z.object({
    query: z.string().describe('The search query'),
    limit: z
      .number()
      .optional()
      .default(3)
      .describe('Maximum number of results'),
  }),
  execute: async ({ query, limit = 3 }, { writeSource }) => {
    // Extract keywords from query (remove common stop words)
    const stopWords = ['what', 'is', 'are', 'the', 'a', 'an', 'how', 'why', 'when', 'where', 'who', 'tell', 'me', 'about', 'explain'];
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word));

    // Simulate vector search (in production, use a real vector database)
    // Search for documents that contain any of the keywords
    const results = knowledgeBase
      .filter(doc => {
        const contentLower = doc.content.toLowerCase();
        const titleLower = doc.title.toLowerCase();
        return keywords.some(keyword =>
          contentLower.includes(keyword) || titleLower.includes(keyword)
        );
      })
      .slice(0, limit);

    // Write sources to the stream - they will appear in message.parts
    results.forEach(doc => {
      writeSource?.({
        sourceType: 'url',
        url: doc.url,
        title: doc.title,
        id: doc.id,
      });
    });

    // Return content for the LLM to use
    return results.length > 0
      ? results.map(doc => `${doc.title}: ${doc.content}`).join('\n\n')
      : 'No relevant information found.';
  },
});

const tools = {
  searchKnowledge,
} as const;

export async function POST(req: Request) {
  const body = await req.json();

  // Convert simple messages to ModelMessages format
  const modelMessages = body.messages.map((msg: any) => ({
    role: msg.role,
    content: msg.content || msg.parts?.map((p: any) => p.text || p).join('') || '',
  }));

  const result = streamText({
    model: google('gemini-2.5-pro'),
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse({ sendSources: true });
}
