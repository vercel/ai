import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';
import { checkSchemas } from '../../../lib/check-schemas';

export const dynamic = 'force-dynamic';

export async function GET() {
  const schemas = await checkSchemas();
  const responses = [
    Response.json({
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'generated' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    new Response(
      [
        {
          choices: [
            { index: 0, delta: { role: 'assistant', content: 'streamed' } },
          ],
        },
        { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
      ]
        .map(chunk => `data: ${JSON.stringify(chunk)}\n\n`)
        .join('') + 'data: [DONE]\n\n',
      { headers: { 'Content-Type': 'text/event-stream' } },
    ),
  ];
  const model = createOpenAI({
    apiKey: 'fixture-key',
    fetch: async () => {
      const response = responses.shift();
      if (!response) throw new Error('Unexpected provider request');
      return response;
    },
  }).chat('fixture-model');

  const generated = await generateText({
    model,
    prompt: 'Hello',
    maxRetries: 0,
  });
  const stream = streamText({ model, prompt: 'Hello', maxRetries: 0 });
  const streamed = await stream.text;
  if (responses.length !== 0)
    throw new Error('Provider responses were not consumed');
  return Response.json({ schemas, generated: generated.text, streamed });
}
