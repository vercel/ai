import { google } from '@ai-sdk/google';
import { generateText, isStepCount, jsonSchema, tool } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { text } = await generateText({
    model: google('gemini-2.5-flash'),
    prompt: 'Call get_schema exactly once, then summarize the returned schema.',
    stopWhen: isStepCount(2),
    tools: {
      get_schema: tool({
        description: 'Returns a JSON Schema document.',
        inputSchema: jsonSchema({ type: 'object', properties: {} }),
        // JSON Schema references are valid tool-result data. Gemini previously
        // rejected the follow-up function response because it interpreted $ref
        // as a protocol reference instead of ordinary result content.
        execute: async () => ({
          tools: [
            {
              name: 'find_records',
              inputSchema: {
                $defs: {
                  Node: {
                    type: 'object',
                    properties: {
                      child: { $ref: '#/$defs/Node' },
                    },
                  },
                },
                $ref: '#/$defs/Node',
              },
            },
          ],
        }),
      }),
    },
  });

  console.log(text);
});
