import { vertex } from '@ai-sdk/google-vertex';
import { generateText } from 'ai';

export async function GET() {
  const model = vertex('gemini-1.5-flash');
  const { text } = await generateText({
    model,
    prompt: 'tell me a story',
  });
  return Response.json({ message: text });
}
