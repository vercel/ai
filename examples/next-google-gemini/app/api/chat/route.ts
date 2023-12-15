import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleGenAIStream, Message, StreamingTextResponse } from 'ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

// NOTE: The Vertex AI client is not compatible with the Edge runtime.
// IMPORTANT! Set the runtime to edge
// export const runtime = 'edge';

const experimental_buildGeminiPrompt = (messages: Message[]) => {
  return {
    contents: messages
      .filter(
        message => message.role === 'user' || message.role === 'assistant',
      )
      .map(message => ({
        role: message.role === 'user' ? 'user' : 'model',
        parts: [{ text: message.content }],
      })),
  };
};

export async function POST(req: Request) {
  // Extract the `prompt` from the body of the request
  const { messages } = await req.json();

  // Instantiate the model
  const generativeModel = genAI.getGenerativeModel({ model: 'gemini-pro' });

  const geminiStream = await generativeModel.generateContentStream(
    experimental_buildGeminiPrompt(messages),
  );

  // Convert the response into a friendly text-stream
  const stream = GoogleGenAIStream(geminiStream);

  // Respond with the stream
  return new StreamingTextResponse(stream);
}
