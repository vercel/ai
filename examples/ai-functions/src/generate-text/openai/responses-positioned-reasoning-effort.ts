import {
  openai,
  type OpenAIResponsesSystemMessageOptions,
} from '@ai-sdk/openai';
import { generateText, type ModelMessage } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const messages: ModelMessage[] = [];
  const turns = [
    { prompt: 'Suggest a name for a small neighborhood bakery.' },
    {
      effort: 'high',
      prompt: 'Give one reason that name would be easy to remember.',
    },
    { effort: 'low', prompt: 'Write a five-word tagline for it.' },
  ] satisfies Array<{
    prompt: string;
    effort?: OpenAIResponsesSystemMessageOptions['reasoningEffortUpdate'];
  }>;

  for (const { prompt, effort } of turns) {
    if (effort != null) {
      messages.push({
        role: 'system',
        content: '',
        providerOptions: {
          openai: {
            reasoningEffortUpdate: effort,
          } satisfies OpenAIResponsesSystemMessageOptions,
        },
      });
    }
    messages.push({ role: 'user', content: prompt });

    const result = await generateText({
      model: openai.responses('gpt-6-luna'),
      // Keep the initial effort unchanged; later changes stay in messages.
      reasoning: 'low',
      allowSystemInMessages: true,
      messages,
      providerOptions: { openai: { store: false } },
      maxOutputTokens: 2048,
      maxRetries: 0,
    });

    console.log(result.text);
    console.log('Finish reason:', result.finishReason);
    messages.push(...result.responseMessages);
  }
});
