import { OpenAIStream, StreamingTextResponse } from 'ai';
import OpenAI from 'openai';

export default defineLazyEventHandler(async () => {
  const apiKey = useRuntimeConfig().openaiApiKey;
  if (!apiKey) throw new Error('Missing OpenAI API key');
  const openai = new OpenAI({
    apiKey: apiKey,
  });

  return defineEventHandler(async (event: any) => {
    // Extract the `prompt` from the body of the request
    const { messages, data } = await readBody(event);

    const initialMessages = messages.slice(0, -1);
    const currentMessage = messages[messages.length - 1];

    // Ask OpenAI for a streaming chat completion given the prompt
    const response = await openai.chat.completions.create({
      model: 'gpt-4-vision-preview',
      stream: true,
      max_tokens: 150,
      messages: [
        ...initialMessages,
        {
          ...currentMessage,
          content: [
            { type: 'text', text: currentMessage.content },

            // forward the image information to OpenAI:
            {
              type: 'image_url',
              image_url: data.imageUrl,
            },
          ],
        },
      ],
    });

    // Convert the response into a friendly text-stream
    const stream = OpenAIStream(response);

    // Respond with the stream
    return new StreamingTextResponse(stream);
  });
});
