import { runAgentTUI } from '@ai-sdk/tui';
import { spacexai } from '@ai-sdk/spacexai';
import { ToolLoopAgent } from 'ai';
import { run } from '../../lib/run';

const agent = new ToolLoopAgent({
  model: spacexai.responses('grok-4-fast-non-reasoning'),
  instructions:
    'You are a helpful research assistant. Use search and code execution tools when they help.',
  tools: {
    web_search: spacexai.tools.webSearch(),
    x_search: spacexai.tools.xSearch(),
    code_execution: spacexai.tools.codeExecution(),
  },
});

run(async () => {
  await runAgentTUI({
    title: 'XAI Research Agent',
    agent,
    tools: 'auto-collapsed',
  });
});
