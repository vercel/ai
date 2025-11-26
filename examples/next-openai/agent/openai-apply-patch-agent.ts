import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { ToolLoopAgent, InferAgentUIMessage, tool } from 'ai';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import {
  WorkspaceEditor,
  ApplyPatchOperation,
} from '@/lib/apply-patch-file-editor';

// Create a workspace editor instance for the agent
const workspaceRoot = path.join(process.cwd(), 'workspace');

// Ensure workspace directory exists
async function ensureWorkspaceExists() {
  try {
    await fs.mkdir(workspaceRoot, { recursive: true });
  } catch (error) {}
}

ensureWorkspaceExists();

const editor = new WorkspaceEditor(workspaceRoot);

const baseApplyPatchTool = openai.tools.applyPatch();

export const openaiApplyPatchAgent = new ToolLoopAgent({
  model: openai.responses('gpt-5.1'),
  tools: {
    apply_patch: tool({
      ...baseApplyPatchTool,
      async execute(input: { callId: string; operation: ApplyPatchOperation }) {
        let result: { status: 'completed' | 'failed'; output?: string };
        switch (input.operation.type) {
          case 'create_file':
            result = await editor.createFile(input.operation);
            break;
          case 'update_file':
            result = await editor.updateFile(input.operation);
            break;
          case 'delete_file':
            result = await editor.deleteFile(input.operation);
            break;
        }
        return result;
      },
    }),
  },
  providerOptions: {
    openai: {
      reasoningEffort: 'medium',
      reasoningSummary: 'detailed',
    } satisfies OpenAIResponsesProviderOptions,
  },
});

export type OpenAIApplyPatchMessage = InferAgentUIMessage<
  typeof openaiApplyPatchAgent
>;
