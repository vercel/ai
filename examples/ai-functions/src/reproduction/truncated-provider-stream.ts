import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';
import { run } from '../lib/run';

// Reproduces #23449 without API keys or network requests. Each HTTP response
// closes cleanly after a text delta, before the provider's completion event.
function options(events: unknown[]) {
  return {
    apiKey: 'test',
    fetch: async () =>
      new Response(
        events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''),
        { headers: { 'content-type': 'text/event-stream' } },
      ),
  };
}

run(async () => {
  const chat = [
    {
      id: 'c1',
      model: 'gpt-4o',
      created: 1,
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', content: 'Octopuses change colour' },
          finish_reason: null,
        },
      ],
    },
  ];

  const models = {
    'OpenAI Chat': createOpenAI(options(chat)).chat('gpt-4o'),
    'OpenAI Responses': createOpenAI(
      options([
        {
          type: 'response.created',
          response: { id: 'r1', created_at: 1, model: 'gpt-4o' },
        },
        {
          type: 'response.output_item.added',
          output_index: 0,
          item: {
            type: 'message',
            id: 'msg1',
            role: 'assistant',
            content: [],
          },
        },
        {
          type: 'response.output_text.delta',
          item_id: 'msg1',
          output_index: 0,
          content_index: 0,
          delta: 'Octopuses change colour',
        },
      ]),
    )('gpt-4o'),
    Anthropic: createAnthropic(
      options([
        {
          type: 'message_start',
          message: {
            id: 'msg1',
            model: 'claude-sonnet-4-5',
            stop_reason: null,
            usage: { input_tokens: 10, output_tokens: 1 },
          },
        },
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Octopuses change colour' },
        },
      ]),
    )('claude-sonnet-4-5'),
    Google: createGoogle(
      options([
        {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'Octopuses change colour' }],
              },
            },
          ],
        },
      ]),
    )('gemini-2.5-flash'),
    'OpenAI-compatible': createOpenAICompatible({
      name: 'compat',
      baseURL: 'https://example.test/v1',
      ...options(chat),
    })('test-model'),
  };

  for (const [name, model] of Object.entries(models)) {
    console.log(`\n${name}:`);
    const result = streamText({
      model,
      prompt: 'How do octopuses hide?',
      onError: () => {},
    });
    for await (const part of result.fullStream) {
      if (part.type === 'error') {
        console.log('error:', part.error);
      } else if (part.type === 'finish') {
        console.log('finish:', part.finishReason);
      }
    }
    console.log('Partial text:', await result.text);
  }
});
