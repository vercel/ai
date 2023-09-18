// ./app/api/chat/route.ts
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicStream, StreamingTextResponse } from 'ai';

// Create an Anthropic API client (that's edge friendly??)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// IMPORTANT! Set the runtime to edge
export const runtime = 'edge';

// Claude has an interesting way of dealing with prompts, so we use a helper function to build one from our request
// Prompt formatting is discussed briefly at https://docs.anthropic.com/claude/reference/getting-started-with-the-api
function buildPrompt(
  messages: { content: string; role: 'system' | 'user' | 'assistant' }[],
) {
  return (
    Anthropic.HUMAN_PROMPT +
    messages.map(({ content, role }) => {
      if (role === 'user') {
        return `Human: ${content}`;
      } else {
        return `Assistant: ${content}`;
      }
    }) +
    Anthropic.AI_PROMPT
  );
}

export async function POST(req: Request) {
  // Extract the `prompt` from the body of the request
  const { messages } = await req.json();

  // Ask Claude for a streaming chat completion given the prompt
  const response = await anthropic.completions.create({
    prompt: buildPrompt(messages),
    model: 'claude-2',
    stream: true,
    max_tokens_to_sample: 300,
  });
  // Convert the response into a friendly text-stream
  const stream = AnthropicStream(response);
  // Respond with the stream
  return new StreamingTextResponse(stream);
}
