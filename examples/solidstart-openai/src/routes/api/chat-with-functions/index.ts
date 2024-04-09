import { OpenAIStream, StreamingTextResponse, StreamData } from 'ai';
import OpenAI from 'openai';
import type { ChatCompletionCreateParams } from 'openai/resources/chat';

import { APIEvent } from 'solid-start/api';

// Create an OpenAI API client
const openai = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'] || '',
});

const functions: ChatCompletionCreateParams.Function[] = [
  {
    name: 'get_current_weather',
    description: 'Get the current weather.',
    parameters: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: ['celsius', 'fahrenheit'],
          description: 'The temperature unit to use.',
        },
      },
      required: ['format'],
    },
  },
  {
    name: 'eval_code_in_browser',
    description: 'Execute javascript code in the browser with eval().',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: `Javascript code that will be directly executed via eval(). Do not use backticks in your response.
           DO NOT include any newlines in your response, and be sure to provide only valid JSON when providing the arguments object.
           The output of the eval() will be returned directly by the function.`,
        },
      },
      required: ['code'],
    },
  },
];

export const POST = async (event: APIEvent) => {
  const { messages } = await event.request.json();

  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo-0613',
    stream: true,
    messages,
    functions,
  });

  const data = new StreamData();
  const stream = OpenAIStream(response, {
    experimental_onFunctionCall: async (
      { name, arguments: args },
      createFunctionCallMessages,
    ) => {
      if (name === 'get_current_weather') {
        // Call a weather API here
        const weatherData = {
          temperature: 20,
          unit: args.format === 'celsius' ? 'C' : 'F',
        };

        data.append({
          text: 'Some custom data',
        });

        const newMessages = createFunctionCallMessages(weatherData);
        return openai.chat.completions.create({
          messages: [...messages, ...newMessages],
          stream: true,
          model: 'gpt-3.5-turbo-0613',
        });
      }
    },
    onFinal() {
      data.close();
    },
  });

  data.append({
    text: 'Hello, how are you?',
  });

  // Respond with the stream
  return new StreamingTextResponse(stream, {}, data);
};
