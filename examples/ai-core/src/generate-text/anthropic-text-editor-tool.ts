import { anthropic } from '@ai-sdk/anthropic';
import { generateText, stepCountIs } from 'ai';
import { run } from '../lib/run';

run(async () => {
  let editorContent = `
## README
This is a test file.
  `;

  const result = await generateText({
    model: anthropic('claude-sonnet-4-20250514'),
    tools: {
      str_replace_based_edit_tool: anthropic.tools.textEditor_20250728({
        maxCharacters: 10000,
        async execute({ command, path, old_str, new_str }) {
          switch (command) {
            case 'view': {
              return editorContent;
            }
            case 'create': {
              editorContent = new_str!;
              return editorContent;
            }
            case 'str_replace': {
              editorContent = editorContent.replace(old_str!, new_str!);
              return editorContent;
            }
            case 'insert': {
              editorContent = new_str!;
              return editorContent;
            }
          }
        },
        onInputAvailable: ({ input }) => {
          console.log('onInputAvailable', input);
        },
      }),
    },
    prompt: 'Update my README file to talk about AI.',
    stopWhen: stepCountIs(5),
  });

  console.log('TEXT', result.text);
  console.log();
  console.log('EDITOR CONTENT', editorContent);
});
