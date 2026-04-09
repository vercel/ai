import { anthropic } from '@ai-sdk/anthropic';
import { WorkflowAgent, type ModelCallStreamPart } from '@ai-sdk/workflow';
import {
  convertToModelMessages,
  ToolCallRepairFunction,
  type ModelMessage,
  type UIMessage,
} from 'ai';
import { getWritable } from 'workflow';
import z from 'zod';

// ============================================================================
// Tool step functions
// ============================================================================

async function getWeather(input: { city: string }): Promise<{
  city: string;
  temperature: number;
  unit: string;
  condition: string;
}> {
  'use step';
  const hash = input.city
    .toLowerCase()
    .split('')
    .reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const temperature = 40 + (hash % 60);
  const conditions = [
    'sunny',
    'cloudy',
    'rainy',
    'snowy',
    'windy',
    'partly cloudy',
  ];
  return {
    city: input.city,
    temperature,
    unit: 'fahrenheit',
    condition: conditions[hash % conditions.length],
  };
}

async function calculate(input: {
  expression: string;
}): Promise<{ expression: string; result: number }> {
  'use step';
  const translated = input.expression.replace(/\s/g, '').replace(/\^/g, '**');
  if (!/^[0-9+\-*/().]+$/.test(translated))
    throw new Error(`Invalid expression: ${input.expression}`);
  return {
    expression: input.expression,
    result: new Function(`return (${translated})`)() as number,
  };
}

async function deleteFileStep(input: {
  path: string;
}): Promise<{ deleted: string }> {
  'use step';
  console.log('[deleteFile] Deleting:', input.path);
  return { deleted: input.path };
}

// ============================================================================
// Tools and workflow
// ============================================================================

const tools = {
  getWeather: {
    description: 'Get the current weather for a city.',
    inputSchema: z.object({ city: z.string().describe('The city name') }),
    execute: getWeather,
  },
  calculate: {
    description: 'Evaluate a math expression.',
    inputSchema: z.object({
      expression: z.string().describe('The expression'),
    }),
    execute: calculate,
  },
  deleteFile: {
    description: 'Delete a file from the filesystem.',
    inputSchema: z.object({ path: z.string().describe('The file path') }),
    execute: deleteFileStep,
    needsApproval: true as const,
  },
};

const repairToolCall: ToolCallRepairFunction<typeof tools> = async ({
  toolCall,
}) => {
  'use step';
  return toolCall;
};

/**
 * Map of tool names to their step execute functions.
 * Used to execute approved tools in the workflow context.
 */
const toolExecutors: Record<string, (input: any) => Promise<any>> = {
  getWeather,
  calculate,
  deleteFile: deleteFileStep,
};

/**
 * Process approval responses in model messages.
 * Executes approved tools via step functions, strips approval parts,
 * and injects tool results into the conversation.
 */
async function processApprovals(
  messages: ModelMessage[],
): Promise<ModelMessage[]> {
  // Find tool-approval-response parts
  const approvalResponses: Array<{
    approvalId: string;
    approved: boolean;
    reason?: string;
  }> = [];
  const approvalRequestMap = new Map<string, string>(); // approvalId → toolCallId
  const toolCallMap = new Map<string, { toolName: string; input: unknown }>(); // toolCallId → toolCall

  for (const msg of messages) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const part of msg.content as any[]) {
        if (part.type === 'tool-call') {
          toolCallMap.set(part.toolCallId, {
            toolName: part.toolName,
            input: part.input ?? part.args,
          });
        }
        if (part.type === 'tool-approval-request') {
          approvalRequestMap.set(part.approvalId, part.toolCallId);
        }
      }
    }
    if (msg.role === 'tool') {
      for (const part of msg.content as any[]) {
        if (part.type === 'tool-approval-response') {
          approvalResponses.push(part);
        }
      }
    }
  }

  if (approvalResponses.length === 0) return messages;

  // Execute approved tools and collect results
  const toolResults: Array<{
    toolCallId: string;
    toolName: string;
    output: any;
  }> = [];
  const denialResults: Array<{
    toolCallId: string;
    toolName: string;
    reason?: string;
  }> = [];

  for (const response of approvalResponses) {
    const toolCallId = approvalRequestMap.get(response.approvalId);
    if (!toolCallId) continue;
    const toolCall = toolCallMap.get(toolCallId);
    if (!toolCall) continue;

    if (response.approved) {
      const executor = toolExecutors[toolCall.toolName];
      if (executor) {
        const result = await executor(toolCall.input);
        toolResults.push({
          toolCallId,
          toolName: toolCall.toolName,
          output: result,
        });
      }
    } else {
      denialResults.push({
        toolCallId,
        toolName: toolCall.toolName,
        reason: response.reason,
      });
    }
  }

  // Build a set of tool call IDs that have been resolved (approved or denied)
  const resolvedToolCallIds = new Set<string>();
  for (const tr of toolResults) resolvedToolCallIds.add(tr.toolCallId);
  for (const dr of denialResults) resolvedToolCallIds.add(dr.toolCallId);

  // Build tool result content parts
  const toolContent: any[] = [];
  for (const tr of toolResults) {
    const output =
      typeof tr.output === 'string'
        ? { type: 'text' as const, value: tr.output }
        : { type: 'json' as const, value: tr.output };
    toolContent.push({
      type: 'tool-result',
      toolCallId: tr.toolCallId,
      toolName: tr.toolName,
      output,
    });
  }
  for (const dr of denialResults) {
    toolContent.push({
      type: 'tool-result',
      toolCallId: dr.toolCallId,
      toolName: dr.toolName,
      output: {
        type: 'execution-denied',
        reason: dr.reason ?? 'Tool execution denied.',
      },
    });
  }

  // Rebuild messages:
  // - Strip approval-request / approval-response parts
  // - Insert tool results immediately after the assistant message containing the tool calls
  // - Remove trailing empty user messages (from sendMessage({ text: '' }))
  const cleanMessages: ModelMessage[] = [];
  for (const msg of messages) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      const content = (msg.content as any[]).filter(
        (p: any) => p.type !== 'tool-approval-request',
      );
      if (content.length > 0) {
        cleanMessages.push({ ...msg, content });

        // Check if this assistant message has any resolved tool calls
        const hasResolvedToolCalls = (msg.content as any[]).some(
          (p: any) =>
            p.type === 'tool-call' && resolvedToolCallIds.has(p.toolCallId),
        );
        if (hasResolvedToolCalls && toolContent.length > 0) {
          cleanMessages.push({ role: 'tool', content: toolContent });
        }
      }
    } else if (msg.role === 'tool') {
      const content = (msg.content as any[]).filter(
        (p: any) => p.type !== 'tool-approval-response',
      );
      if (content.length > 0) cleanMessages.push({ ...msg, content });
    } else {
      cleanMessages.push(msg);
    }
  }

  return cleanMessages;
}

export async function chat(messages: UIMessage[]) {
  'use workflow';

  const modelMessages = await convertToModelMessages(messages);

  // Process any pending approvals before running the agent
  const processedMessages = await processApprovals(modelMessages);

  const agent = new WorkflowAgent({
    model: anthropic('claude-sonnet-4-20250514'),
    instructions:
      'You are a helpful assistant with access to weather, calculator, and file deletion tools. Always use the appropriate tool when the user asks to perform an action — never just say you will do it, actually call the tool. Keep responses concise.',
    tools,
  });

  const result = await agent.stream({
    messages: processedMessages,
    writable: getWritable<ModelCallStreamPart>(),
    experimental_repairToolCall: repairToolCall as any,
  });

  return { messages: result.messages };
}
