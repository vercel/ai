import { anthropic } from '@ai-sdk/anthropic';
import { generateText, stepCountIs } from 'ai';
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
    messages: [
      {
        role: 'user',
        content: 'Update my README file to talk about AI.',
        providerOptions: {
          anthropic: {
            cacheControl: { type: 'ephemeral' },
          },
        },
      },
    ],
    stopWhen: stepCountIs(5),
  });

  console.log('TEXT', result.text);
  console.log('CACHE', result.providerMetadata?.anthropic);
  console.log();
  console.log('EDITOR CONTENT', editorContent);
}

main().catch(console.error);
