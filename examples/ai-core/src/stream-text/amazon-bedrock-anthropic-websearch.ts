import { bedrock } from '@ai-sdk/amazon-bedrock';
import { anthropicTools } from '@ai-sdk/anthropic/internal';
import { stepCountIs, streamText, ToolCallPart, ToolResultPart } from 'ai';
import 'dotenv/config';

// This will throw a warning as web_search is not supported on amazon bedrock
async function main() {
  const result = streamText({
    model: bedrock('us.anthropic.claude-sonnet-4-20250514-v1:0'),
    prompt:
      'What are the latest news about climate change and renewable energy? Please provide current information and cite your sources.',
    tools: {
      web_search: anthropicTools.webSearch_20250305({
        maxUses: 8,
        blockedDomains: ['pinterest.com', 'reddit.com/r/conspiracy'],
        userLocation: {
          type: 'approximate',
          city: 'New York',
          region: 'New York',
          country: 'US',
          timezone: 'America/New_York',
        },
      }),
    },
    stopWhen: stepCountIs(3),
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
  console.log('Warnings:', await result.warnings);
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
