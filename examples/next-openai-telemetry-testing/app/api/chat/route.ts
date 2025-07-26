import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { recordCompletion, tracer } from '@/lib/telemetry';

export async function POST(req: Request) {
  const startTime = Date.now();
  let status: 'success' | 'error' = 'success';
  let tokens = 0;

  try {
    const { prompt } = await req.json();

    // Create a span for this operation
    const span = tracer.startSpan('ai_completion');

    try {
      const result = await generateText({
        model: openai('gpt-4-turbo'),
        maxOutputTokens: 100,
        prompt,
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'chat-completion',
          metadata: { prompt_length: prompt.length },
        },
      });

      tokens = result.usage?.totalTokens ?? 0;
      
      return new Response(JSON.stringify({ text: result.text }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } finally {
      span.end();
    }
  } catch (error) {
    status = 'error';
    throw error;
  } finally {
    // Record metrics
    const latency = Date.now() - startTime;
    recordCompletion(latency, tokens, status);
  }
} 