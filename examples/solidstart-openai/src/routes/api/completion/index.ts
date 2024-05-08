import { OpenAIStream, StreamingTextResponse, StreamData } from 'ai';
import OpenAI from 'openai';

import { APIEvent } from 'solid-start/api';

// Create an OpenAI API client
const openai = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'] || '',
});

export const POST = async (event: APIEvent) => {
  // Extract the `prompt` from the body of the request
  const { prompt } = await event.request.json();

  // Ask OpenAI for a streaming chat completion given the prompt
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    stream: true,
    messages: [{ role: 'user', content: prompt }],
  });

  // optional: use stream data
  const data = new StreamData();

  data.append({ test: 'value' });

  // Convert the response into a friendly text-stream
  const stream = OpenAIStream(response, {
    onFinal(completion) {
      data.close();
    },
  });

  // Respond with the stream
  return new StreamingTextResponse(stream, {}, data);
};
