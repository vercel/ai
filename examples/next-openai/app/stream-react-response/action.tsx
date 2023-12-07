'use server';

import {
  Message,
  OpenAIStream,
  experimental_StreamData,
  experimental_StreamingReactResponse,
} from 'ai';
import { experimental_buildOpenAIMessages } from 'ai/prompts';
import OpenAI from 'openai';
import { ChatCompletionCreateParams } from 'openai/resources/chat';

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

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
  });

  // Request the OpenAI API for the response based on the prompt
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    stream: true,
    messages: experimental_buildOpenAIMessages(messages),
    functions,
  });

  const stream = OpenAIStream(response, {
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

          // generate image
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

  return new experimental_StreamingReactResponse(stream, {
    data,
    ui({ content, data }) {
      if (data?.[0] != null) {
        const value = data[0] as any;

        switch (value.type) {
          case 'weather': {
            return (
              <div className="bg-blue-500 text-white p-6 rounded-lg shadow-md">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">{value.location}</h2>
                  <svg
                    className=" w-8 h-8"
                    fill="none"
                    height="24"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    width="24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                  </svg>
                </div>
                <p className="text-4xl font-semibold mt-2">
                  {value.temperature}° {value.format}
                </p>
              </div>
            );
          }

          case 'image': {
            return (
              <div className="border-8 border-[#8B4513] dark:border-[#5D2E1F] rounded-lg overflow-hidden">
                <img
                  alt="Framed Image"
                  className="aspect-square object-cover w-full"
                  height="500"
                  src={value.url}
                  width="500"
                />
              </div>
            );
          }
        }
      }

      return <div>{content}</div>;
    },
  });
}
