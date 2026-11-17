import { anthropic } from '@ai-sdk/anthropic';
import { stepCountIs, ToolLoopAgent } from 'ai';
import { run } from '../../lib/run';
import { weatherTool } from '../../tools/weather-tool';

const agent = new ToolLoopAgent({
  model: anthropic('claude-sonnet-4-6'),
  maxOutputTokens: 256,
  instructions: 'Use the weather tool before answering. Keep replies brief.',
  tools: { weather: weatherTool },
  stopWhen: stepCountIs(5),
  prepareStep: ({ steps }) => {
    const previous = steps.at(-1);
    if (previous == null) {
      return { providerOptions: { anthropic: { thread: { type: 'create' } } } };
    }
    const previousMessageId = previous.response.id;
    if (previousMessageId == null) throw new Error('Missing message ID.');

    // The server already has the assistant's tool calls. Send only the new
    // locally executed tool results, not the accumulated conversation.
    return {
      messages: previous.response.messages.filter(
        message => message.role === 'tool',
      ),
      providerOptions: {
        anthropic: { thread: { type: 'continue', previousMessageId } },
      },
    };
  },
});

run(async () => {
  // Persist your input and each step's response.messages for recovery. If a
  // continuation fails, replay those messages in a new create request; do not
  // rerun already executed tools, which may have side effects.
  const result = await agent.generate({
    prompt: 'What is the current weather in Paris?',
  });
  console.log('Steps:', result.steps.length);
  console.log(result.text);
});
