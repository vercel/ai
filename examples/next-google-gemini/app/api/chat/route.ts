import { VertexAI } from '@google-cloud/vertexai';
import { GoogleVertexAIStream, Message, StreamingTextResponse } from 'ai';

// Initialize Vertex with your Cloud project and location
const vertex_ai = new VertexAI({
  project: process.env.GCP_PROJECT || '',
  location: 'us-central1',
});

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

  // Instantiate the models
  const generativeModel = vertex_ai.preview.getGenerativeModel({
    model: 'gemini-pro',
    generation_config: {
      max_output_tokens: 2048,
      temperature: 0.4,
      top_p: 1,
      top_k: 32,
    },
  });

  const geminiStream = await generativeModel.generateContentStream(
    experimental_buildGeminiPrompt(messages),
  );

  // Convert the response into a friendly text-stream
  const stream = GoogleVertexAIStream(geminiStream);

  // Respond with the stream
  return new StreamingTextResponse(stream);
}
