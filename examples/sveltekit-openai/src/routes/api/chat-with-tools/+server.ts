import OpenAI from 'openai';
import {
  OpenAIStream,
  StreamingTextResponse,
  StreamData,
  type Tool,
  type ToolCallPayload,
} from 'ai';
import { env } from '$env/dynamic/private';

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY || '',
});

const tools: Tool[] = [
  {
    type: 'function',
    function: {
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
  },
  {
    type: 'function',
    function: {
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
  },
];

export async function POST({ request }) {
  const { messages } = await request.json();

  const model = 'gpt-3.5-turbo-1106';

  const response = await openai.chat.completions.create({
    model,
    stream: true,
    messages,
    tools,
    tool_choice: 'auto',
  });

  const data = new StreamData();

  const stream = OpenAIStream(response, {
    experimental_onToolCall: async (
      call: ToolCallPayload,
      appendToolCallMessage,
    ) => {
      for (const toolCall of call.tools) {
        // Note: this is a very simple example of a tool call handler
        // that only supports a single tool call function.
        if (toolCall.func.name === 'get_current_weather') {
          // Call a weather API here
          const weatherData = {
            temperature: 20,
            unit: toolCall.func.arguments.format === 'celsius' ? 'C' : 'F',
          };

          const newMessages = appendToolCallMessage({
            tool_call_id: toolCall.id,
            function_name: 'get_current_weather',
            tool_call_result: weatherData,
          });

          return openai.chat.completions.create({
            messages: [...messages, ...newMessages],
            model,
            stream: true,
            tools,
            tool_choice: 'auto',
          });
        }
      }
    },
    onCompletion(completion) {
      console.log('completion:', completion);
    },
    onFinal() {
      data.close();
    },
  });

  data.append({
    text: 'Hello, how are you?',
  });

  return new StreamingTextResponse(stream, {}, data);
}
