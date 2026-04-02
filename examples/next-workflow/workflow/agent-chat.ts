import { WorkflowAgent, type ModelCallStreamPart } from '@ai-sdk/workflow';
import {
  convertToModelMessages,
  ToolCallRepairFunction,
  type UIMessage,
} from 'ai';
import { getWritable } from 'workflow';
import z from 'zod';

// ============================================================================
// Tool step functions — these run as durable steps with full Node.js access
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
  const condition = conditions[hash % conditions.length];
  return { city: input.city, temperature, unit: 'fahrenheit', condition };
}

async function calculate(input: {
  expression: string;
}): Promise<{ expression: string; result: number }> {
  'use step';
  const translated = input.expression.replace(/\s/g, '').replace(/\^/g, '**');
  if (!/^[0-9+\-*/().]+$/.test(translated)) {
    throw new Error(`Invalid expression: ${input.expression}`);
  }
  const result = new Function(`return (${translated})`)() as number;
  return { expression: input.expression, result };
}

async function deleteFileStep(input: {
  path: string;
}): Promise<{ deleted: string }> {
  'use step';
  console.log('[deleteFile] Deleting:', input.path);
  return { deleted: input.path };
}

// ============================================================================
// Chat workflow
// ============================================================================

const tools = {
  getWeather: {
    description:
      'Get the current weather for a city. Returns temperature in Fahrenheit and conditions.',
    inputSchema: z.object({
      city: z.string().describe('The city name to get weather for'),
    }),
    execute: getWeather,
  },
  calculate: {
    description:
      'Evaluate a simple math expression. Supports +, -, *, /, and parentheses.',
    inputSchema: z.object({
      expression: z
        .string()
        .describe('The math expression to evaluate, e.g. "2 + 3 * 4"'),
    }),
    execute: calculate,
  },
  deleteFile: {
    description: 'Delete a file from the filesystem.',
    inputSchema: z.object({
      path: z.string().describe('The file path to delete'),
    }),
    execute: deleteFileStep,
    needsApproval: true as const,
  },
};

const repairToolCall: ToolCallRepairFunction<typeof tools> = async ({
  toolCall,
}) => {
  'use step';
  console.log('Repairing tool call', { toolCall });
  return toolCall;
};

/**
 * Patch UIMessages to add placeholder tool results for any unresolved
 * tool calls. This prevents AI_MissingToolResultsError when the user
 * approves/denies a tool that was paused by needsApproval.
 */
function patchUnresolvedToolCalls(messages: UIMessage[]): UIMessage[] {
  // Collect all tool call IDs and tool result IDs
  const toolCallIds = new Set<string>();
  const toolResultIds = new Set<string>();

  for (const msg of messages) {
    for (const part of msg.parts) {
      const p = part as any;
      if (
        p.type?.startsWith('tool-') &&
        p.toolCallId &&
        p.state !== undefined
      ) {
        toolCallIds.add(p.toolCallId);
        if (p.state === 'output-available') {
          toolResultIds.add(p.toolCallId);
        }
      }
    }
  }

  // Find unresolved tool calls
  const unresolvedIds = [...toolCallIds].filter(id => !toolResultIds.has(id));
  if (unresolvedIds.length === 0) return messages;

  // Strip assistant messages that contain only unresolved tool calls
  return messages.filter(msg => {
    if (msg.role !== 'assistant') return true;
    const hasOnlyUnresolvedTools = msg.parts.every(part => {
      const p = part as any;
      if (p.type?.startsWith('tool-') && p.toolCallId) {
        return unresolvedIds.includes(p.toolCallId);
      }
      // Keep step-start and other non-content parts
      return p.type === 'step-start';
    });
    return !hasOnlyUnresolvedTools;
  });
}

export async function chat(messages: UIMessage[]) {
  'use workflow';

  const patchedMessages = patchUnresolvedToolCalls(messages);
  const modelMessages = await convertToModelMessages(patchedMessages);

  const agent = new WorkflowAgent({
    model: 'anthropic/claude-sonnet-4-20250514',
    instructions:
      'You are a helpful assistant with access to weather, calculator, and file deletion tools. Always use the appropriate tool when the user asks to perform an action — never just say you will do it, actually call the tool. Keep responses concise.',
    tools,
  });

  const result = await agent.stream({
    messages: modelMessages,
    writable: getWritable<ModelCallStreamPart>(),
    experimental_repairToolCall: repairToolCall as any,
  });

  return {
    messages: result.messages,
    toolCalls: result.toolCalls,
    toolResults: result.toolResults,
  };
}
