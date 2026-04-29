import { vertex } from '@ai-sdk/google-vertex/edge';
import { generateText } from 'ai';

export const runtime = 'edge';

export async function GET() {
  const model = vertex('gemini-2.5-flash');
  const { text } = await generateText({
    model,
    prompt: 'tell me a story',
  });
  return Response.json({ message: text });
}
