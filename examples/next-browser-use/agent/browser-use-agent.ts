import { runBrowserTaskTool } from '@/tool/run-browser-task-tool';
import { openai } from '@ai-sdk/openai';
import { ToolLoopAgent, type InferAgentUIMessage } from 'ai';

export const browserUseAgent = new ToolLoopAgent({
  model: openai('gpt-4o'),
  instructions:
    'You are a helpful assistant with access to a real cloud browser via the runBrowserTask tool. ' +
    'Call the tool whenever the answer requires live web data or interacting with a website. ' +
    'Pass a single, concrete natural-language instruction to the tool. ' +
    'After the tool returns, summarize the output for the user.',
  tools: {
    runBrowserTask: runBrowserTaskTool,
  },
});

export type BrowserUseAgentUIMessage = InferAgentUIMessage<
  typeof browserUseAgent
>;
