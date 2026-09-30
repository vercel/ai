import { anthropic } from '@ai-sdk/anthropic';
import { stepCountIs, streamText } from 'ai';
import fs from 'fs';
import 'dotenv/config';
import { run } from '../lib/run';

run(async () => {
  // The computer toolset replaces the versioned computer tools on newer models.
  // Opus 5.5 only accepts computer use through the toolset. The API returns
  // each action as its own tool call; the AI SDK maps them to this tool and
  // passes the action name as `action`.
  const result = streamText({
    model: anthropic('claude-opus-5-5'),
    tools: {
      computer: anthropic.tools.computerToolset_20260801({
        configs: {
          // all actions are enabled by default, including zoom
          hold_key: { enabled: false },
        },

        async execute({ action, coordinate, text, region }) {
          switch (action) {
            case 'screenshot':
            case 'zoom': {
              return {
                type: 'image',
                data: fs
                  .readFileSync('./data/screenshot-editor.png')
                  .toString('base64'),
              };
            }
            default: {
              console.log('Action:', action, { coordinate, text, region });
              return `executed ${action}`;
            }
          }
        },

        toModelOutput({ output }) {
          return {
            type: 'content',
            value: [
              typeof output === 'string'
                ? { type: 'text', text: output }
                : {
                    type: 'media',
                    data: output.data,
                    mediaType: 'image/png',
                  },
            ],
          };
        },
      }),
    },
    prompt:
      'Take a screenshot, then click into the search box and type "pictures of cats".',
    stopWhen: stepCountIs(5),
  });

  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    } else if (part.type === 'tool-call') {
      console.log(
        `\nTool call: ${part.toolName}(${JSON.stringify(part.input)})`,
      );
    } else if (part.type === 'tool-result') {
      console.log('Tool result received');
    }
  }

  console.log();
  console.log('Finish reason:', await result.finishReason);
  console.log('Usage:', await result.usage);
});
