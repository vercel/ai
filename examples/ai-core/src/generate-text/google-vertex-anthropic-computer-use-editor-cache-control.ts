import 'dotenv/config';
import { vertexAnthropic } from '@ai-sdk/google-vertex/anthropic';
import { generateText } from 'ai';

async function main() {
  let editorContent = `
## README
This is a test file.
  `;

  const result = await generateText({
    model: vertexAnthropic('claude-3-5-sonnet-v2@20241022', {
      cacheControl: true,
    }),
    tools: {
      str_replace_editor: vertexAnthropic.tools.textEditor_20241022({
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
        experimental_providerMetadata: {
          anthropic: {
            cacheControl: { type: 'ephemeral' },
          },
        },
      },
    ],
    maxSteps: 5,
  });

  console.log('TEXT', result.text);
  console.log('CACHE', result.experimental_providerMetadata?.anthropic);
  console.log();
  console.log('EDITOR CONTENT', editorContent);
}

main().catch(console.error);
