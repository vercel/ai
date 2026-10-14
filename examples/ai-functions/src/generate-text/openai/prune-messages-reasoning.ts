import { openai } from '@ai-sdk/openai';
import { generateText, pruneMessages, type ModelMessage } from 'ai';
import { weatherTool } from '../../tools/weather-tool';
import { run } from '../../lib/run';

const model = openai('gpt-5.1');
const providerOptions = { openai: { reasoningEffort: 'medium' as const } };
const tools = { weather: weatherTool };

run(async () => {
  const messages: ModelMessage[] = [
    {
      role: 'user',
      content:
        'Use the weather tool to get the weather in San Francisco and New York, then compare them.',
    },
  ];

  // step 1: reasoning + tool calls
  const toolStep = await generateText({
    model,
    providerOptions,
    tools,
    toolChoice: 'required',
    messages,
  });
  messages.push(...toolStep.response.messages);

  // step 2: reasoning + final answer
  const answerStep = await generateText({
    model,
    providerOptions,
    tools,
    toolChoice: 'none',
    messages,
  });
  messages.push(...answerStep.response.messages, {
    role: 'user',
    content: 'Which city should I visit this weekend?',
  });

  // remove the reasoning from the history.
  // the stored assistant messages can no longer be referenced by id,
  // because OpenAI requires their reasoning items to be sent with them.
  const { text } = await generateText({
    model,
    providerOptions,
    tools,
    toolChoice: 'none',
    messages: pruneMessages({ messages, reasoning: 'all' }),
  });

  console.log(text);
});
