import {
  anthropic,
  type AnthropicLanguageModelOptions,
} from '@ai-sdk/anthropic';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-sonnet-5'),
    prompt: 'Use the bash tool to run exactly this command: echo hello',
    tools: {
      bash: tool({
        description: 'Executes a bash command and returns its output.',
        inputSchema: z.object({ command: z.string() }),
      }),
    },
    providerOptions: {
      anthropic: {
        // Ask the API to classify every tool call for dangerous actions. The
        // dangerous-tool-use beta header is added automatically.
        safeguards: [
          {
            type: 'dangerous_tool_use',
            classifierContext: { v: 1, permission_mode: 'auto' },
          },
        ],
      } satisfies AnthropicLanguageModelOptions,
    },
  });

  console.log('Tool calls:', JSON.stringify(result.toolCalls, null, 2));
  console.log();

  // One entry per requested safeguard; `status.tool_uses` maps each tool call
  // id to its verdict (evaluated with an outcome, skipped, or unavailable).
  const safeguardResults =
    result.finalStep.providerMetadata?.anthropic?.safeguardResults;
  console.log('Safeguard results:', JSON.stringify(safeguardResults, null, 2));
});
