import Anthropic from '@anthropic-ai/sdk';
import { AnthropicStream, StreamingTextResponse } from 'ai';
import { experimental_buildAnthropicPrompt } from 'ai/prompts';

// Create an Anthropic API client (that's edge friendly??)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // Extract the `prompt` from the body of the request
  const { messages } = await req.json();

  // Ask Claude for a streaming chat completion given the prompt
  const response = await anthropic.completions.create({
    prompt: experimental_buildAnthropicPrompt(messages),
    model: 'claude-2',
    stream: true,
    max_tokens_to_sample: 300,
  });
  // Convert the response into a friendly text-stream
  const stream = AnthropicStream(response);
  // Respond with the stream
  return new StreamingTextResponse(stream);
}
