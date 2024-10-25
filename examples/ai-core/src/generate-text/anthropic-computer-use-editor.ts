import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  let editorContent = `
## README
This is a test file.
  `;

  const result = await generateText({
    model: anthropic('claude-3-5-sonnet-20241022'),
    tools: {
      str_replace_editor: anthropic.tools.textEditor_20241022({
        async execute({ command, path, old_str, new_str }) {
          console.log({ command, path, old_str, new_str });
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
      }),
    },
    prompt: 'Update my README file to talk about AI.',
    maxSteps: 5,
  });

  console.log('TEXT', result.text);
  console.log();
  console.log('EDITOR CONTENT', editorContent);
}

main().catch(console.error);
