import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: anthropic('claude-3-5-sonnet-20241022'),
    tools: {
      str_replace_editor: anthropic.tools.textEditor_20241022({
        async execute({ command, path, old_str, new_str }) {
          return 'some text';
        },
      }),
    },
    prompt: 'List the files in my home directory.',
    maxSteps: 2,
  });

  console.log(result.text);
  console.log(result.finishReason);
  console.log(JSON.stringify(result.toolCalls, null, 2));
  console.log(JSON.stringify(result.steps, null, 2));
}

main().catch(console.error);
