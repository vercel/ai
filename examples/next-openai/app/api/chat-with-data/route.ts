import {
  OpenAIStream,
  StreamingTextResponse,
  experimental_StreamData,
} from 'ai';
import OpenAI from 'openai';
import { Chat } from 'openai/resources';

// Create an OpenAI API client (that's edge friendly!)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

// IMPORTANT! Set the runtime to edge
export const runtime = 'edge';

export async function POST(req: Request) {
  // `model` is populated and sent by the client
  const { messages, model } = (await req.json()) as {
    messages: Chat.CreateChatCompletionRequestMessage[];
    model: 'gpt-3.5-turbo' | 'gpt-4';
  };

  const response = await openai.chat.completions.create({
    model,
    stream: true,
    messages,
  });

  const data = new experimental_StreamData();
  const stream = OpenAIStream(response, {
    async onFinal() {
      messages.push({
        content: 'Come up with a title based on the previous response',
        role: 'system',
      });

      const res = await openai.chat.completions.create({
        messages,
        model,
      });

      // send data to change title on client
      data.append({
        title: res.choices[0].message.content,
      });

      // IMPORTANT! clone data stream when done
      data.close();
    },
    experimental_streamData: true,
  });

  return new StreamingTextResponse(stream, {}, data);
}
