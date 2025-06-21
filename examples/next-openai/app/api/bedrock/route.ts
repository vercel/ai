import { bedrock } from '@ai-sdk/amazon-bedrock';
import { convertToModelMessages, streamText, UIMessage } from 'ai';

export async function POST(req: Request) {
  try {
    const { messages }: { messages: UIMessage[] } = await req.json();

    const result = streamText({
      model: bedrock('anthropic.claude-3-haiku-20240307-v1:0'),
      prompt: convertToModelMessages(messages),
      maxOutputTokens: 500,
      temperature: 0.7,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error('Bedrock API Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Bedrock API failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
