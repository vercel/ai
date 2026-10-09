import { HarnessAgent } from '@ai-sdk/harness/agent';
import { claudeCode } from '@ai-sdk/harness-claude-code';
import type { InferToolInput } from 'ai';

const agent = new HarnessAgent({
  harness: claudeCode,
  inactiveTools: ['Projects', 'ClaudeDesign'],
});

const projectsInput: InferToolInput<typeof agent.tools.Projects> = {
  method: 'project_read',
  path: 'brief.md',
};

const claudeDesignInput: InferToolInput<typeof agent.tools.ClaudeDesign> = {
  operation: 'list',
  arguments: {},
};

console.log({
  disabledConditionalTools: ['Projects', 'ClaudeDesign'],
  projectsInput,
  claudeDesignInput,
});
