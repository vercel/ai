import { anthropic } from '@ai-sdk/anthropic';
import { isStepCount, streamText } from 'ai';
import fs from 'node:fs';
import { run } from '../../lib/run';

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
                type: 'file',
                mediaType: 'image',
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
                    type: 'file',
                    mediaType: 'image/png',
                    data: { type: 'data', data: output.data },
                  },
            ],
          };
        },
      }),
    },
    prompt:
      'Take a screenshot, then click into the search box and type "pictures of cats".',
    stopWhen: isStepCount(5),
  });

  for await (const part of result.stream) {
    switch (part.type) {
      case 'text-delta':
        process.stdout.write(part.text);
        break;
      case 'tool-call':
        console.log('\nTool call:', part.toolName, part.input);
        break;
      case 'tool-result':
        console.log('\nTool result:', part.toolName);
        break;
    }
  }

  console.log('\n\nFinish reason:', await result.finishReason);
});
