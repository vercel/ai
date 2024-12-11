export const runtime = 'edge';

import { generateText } from 'ai';
import { vertex } from '@ai-sdk/google-vertex/edge';

export async function GET() {
  const model = vertex('gemini-1.5-flash');
  const { text } = await generateText({
    model,
    prompt: 'tell me a story',
  });
  return Response.json({ message: text });
}
