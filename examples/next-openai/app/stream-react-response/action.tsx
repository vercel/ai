'use server';

import OpenAI from 'openai';
import {
  OpenAIStream,
  experimental_StreamingReactResponse,
  Message,
  experimental_StreamData,
} from 'ai';
import { Counter } from './counter';
import { ChatCompletionCreateParams } from 'openai/resources/chat';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const functions: ChatCompletionCreateParams.Function[] = [
  {
    name: 'get_current_weather',
    description: 'Get the current weather',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'The city and state, e.g. San Francisco, CA',
        },
        format: {
          type: 'string',
          enum: ['celsius', 'fahrenheit'],
          description:
            'The temperature unit to use. Infer this from the users location.',
        },
      },
      required: ['location', 'format'],
    },
  },
  {
    name: 'create_image',
    description: 'Create an image for the given description',
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Description of what the image should be.',
        },
      },
      required: ['description'],
    },
  },
];

export async function handler({ messages }: { messages: Message[] }) {
  const data = new experimental_StreamData();

  // Request the OpenAI API for the response based on the prompt
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    stream: true,
    messages: messages.map(
      m =>
        ({
          role: m.role,
          content: m.content,
        } as any),
    ),
    functions,
  });

  // Convert the response into a friendly text-stream
  const stream = OpenAIStream(response as any, {
    // TODO remove as any ^ post fix #716
    onFinal() {
      data.close();
    },
    async experimental_onFunctionCall({ name, arguments: args }) {
      switch (name) {
        case 'get_current_weather': {
          // fake function call result:
          data.append({
            type: 'weather',
            location: args.location as string,
            format: args.format as string,
            temperature: Math.floor(Math.random() * 60) - 20,
          });
          return;
        }

        case 'create_image': {
          const { description } = args;

          const response = await openai.images.generate({
            model: 'dall-e-2',
            prompt: `${description} in the style of an early 20th century expressionism painting`,
            size: '256x256',
            response_format: 'url',
          });

          data.append({
            type: 'image',
            url: response.data[0].url!,
          });

          return;
        }
      }

      return undefined;
    },
    experimental_streamData: true,
  });

  // Respond with the stream
  return new experimental_StreamingReactResponse(stream, {
    data,
    dataUi({ messages, content, data }) {
      if (data != null) {
        const data2 = (data as any)[0]; // TODO cleanup

        switch (data2.type) {
          case 'weather': {
            return (
              <div className="flex flex-col items-center">
                <p className="text-sm mb-1">
                  The current temperature in {data2.location} is{' '}
                  {data2.temperature} degrees {data2.format}
                </p>
              </div>
            );
          }

          case 'image': {
            return (
              <div className="flex flex-col items-center">
                <img src={data2.url} className="mb-2" />
              </div>
            );
          }
        }
      }

      return <div className="italic text-red-800"></div>;
    },
  });
}
