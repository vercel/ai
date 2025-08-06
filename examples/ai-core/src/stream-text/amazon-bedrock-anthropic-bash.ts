import { bedrock } from '@ai-sdk/amazon-bedrock';
import { anthropicTools } from '@ai-sdk/anthropic/internal';
import { stepCountIs, streamText, ToolCallPart, ToolResultPart } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: bedrock('us.anthropic.claude-sonnet-4-20250514-v1:0'),
    tools: {
      bash: anthropicTools.bash_20250124({
        async execute({ command }) {
          console.log('COMMAND', command);
          return [
            {
              type: 'text',
              text: `
              ❯ ls
              README.md     build         data          node_modules  package.json  src           tsconfig.json
              `,
            },
          ];
        },
      }),
    },
    prompt: 'List the files in my home directory.',
    stopWhen: stepCountIs(2),
  });

  let fullResponse = '';
  const toolCalls: ToolCallPart[] = [];
  const toolResponses: ToolResultPart[] = [];

  for await (const delta of result.fullStream) {
    switch (delta.type) {
      case 'text-delta': {
        fullResponse += delta.text;
        process.stdout.write(delta.text);
        break;
      }

      case 'tool-call': {
        toolCalls.push(delta);

        process.stdout.write(
          `\nTool call: '${delta.toolName}' ${JSON.stringify(delta.input)}`,
        );
        break;
      }

      case 'tool-result': {
        const transformedDelta: ToolResultPart = {
          ...delta,
          output: { type: 'json', value: delta.output as any },
        };
        toolResponses.push(transformedDelta);

        process.stdout.write(
          `\nTool response: '${delta.toolName}' ${JSON.stringify(
            delta.output,
          )}`,
        );
        break;
      }
    }
  }
  process.stdout.write('\n\n');

  console.log();
  console.log('Warnings: ', await result.warnings);
  console.log('Sources:', await result.sources);
  console.log('Finish reason:', await result.finishReason);
  console.log('Usage:', await result.usage);

  const sources = await result.sources;
  for (const source of sources) {
    if (source.sourceType === 'url') {
      console.log('Source URL:', source.url);
      console.log('Title:', source.title);
      console.log();
    }
  }
}

main().catch(console.error);
