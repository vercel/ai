'use server';

import {
  JSONValue,
  Message,
  OpenAIStream,
  experimental_StreamData,
  experimental_StreamingReactResponse,
} from 'ai';
import OpenAI from 'openai';
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
        } as any), // TODO cleanup
    ),
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
    dataUi({ messages, content, data }) {
      if (data != null) {
        const value = (data as JSONValue[])[0] as any; // TODO cleanup

        switch (value.type) {
          case 'weather': {
            return (
              <div className="flex flex-col items-center p-4 bg-blue-100 rounded-lg shadow">
                <p className="text-sm text-blue-900 mb-2 font-medium">
                  The current temperature in
                  <span className="text-lg text-blue-700 font-semibold">
                    {' '}
                    {value.location}{' '}
                  </span>
                  is
                  <span className="text-lg text-blue-700 font-semibold">
                    {' '}
                    {value.temperature}° {value.format}
                  </span>
                </p>
              </div>
            );
          }

          case 'image': {
            return (
              <div className="flex flex-col items-center">
                <img src={value.url} className="mb-2" />
              </div>
            );
          }
        }
      }

      return <div className="italic text-red-800"></div>;
    },
  });
}
