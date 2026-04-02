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
  // Fake weather data based on city name
  const hash = input.city
    .toLowerCase()
    .split('')
    .reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const temperature = 40 + (hash % 60); // 40-99°F
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
  // Only allow numbers, operators, parentheses, and whitespace
  const translated = input.expression.replace(/\s/g, '').replace(/\^/g, '**');
  if (!/^[0-9+\-*/().]+$/.test(translated)) {
    throw new Error(`Invalid expression: ${input.expression}`);
  }
  const result = new Function(`return (${translated})`)() as number;
  return { expression: input.expression, result };
}

// ============================================================================
// Chat workflow — orchestrates the WorkflowAgent
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
    description: 'Delete a file from the filesystem. Always requires approval.',
    inputSchema: z.object({
      path: z.string().describe('The file path to delete'),
    }),
    execute: async (input: { path: string }) => {
      'use step';
      console.log('[deleteFile] Would delete:', input.path);
      return { deleted: input.path };
    },
    needsApproval: true as const,
  },
  sendEmail: {
    description:
      'Send an email. Requires approval only for external recipients.',
    inputSchema: z.object({
      to: z.string().describe('Email recipient'),
      subject: z.string().describe('Email subject'),
    }),
    execute: async (input: { to: string; subject: string }) => {
      'use step';
      console.log('[sendEmail] Would send to:', input.to);
      return { sent: true, to: input.to, subject: input.subject };
    },
    needsApproval: async (input: { to: string; subject: string }) => {
      const isExternal = !input.to.endsWith('@company.com');
      console.log(
        '[sendEmail needsApproval]',
        input.to,
        isExternal ? '→ needs approval' : '→ auto-approved',
      );
      return isExternal;
    },
  },
};
const repairToolCall: ToolCallRepairFunction<typeof tools> = async ({
  toolCall,
}) => {
  'use step';

  console.log('Repairing tool call', { toolCall });

  return toolCall;
};

export async function chat(messages: UIMessage[]) {
  'use workflow';

  const modelMessages = await convertToModelMessages(messages);

  const agent = new WorkflowAgent({
    model: 'anthropic/claude-sonnet-4-20250514',
    instructions:
      'You are a helpful assistant with access to weather and calculator tools. Use them when the user asks about weather in a city or needs math calculations. Keep responses concise.',
    tools,
    prepareCall: async options => {
      console.log('[prepareCall]', {
        model: typeof options.model === 'string' ? options.model : 'factory',
        messageCount: options.messages.length,
        hasTools: Object.keys(options.tools).length > 0,
      });
      return options;
    },
    onStepFinish: async stepResult => {
      console.log('[agent-chat] step finished:', {
        finishReason: stepResult.finishReason,
        text: stepResult.text?.slice(0, 100),
      });
    },
    onFinish: async event => {
      console.log('[agent-chat] finished:', {
        finishReason: event.finishReason,
        steps: event.steps.length,
      });
    },
    experimental_onStart: async ({ model, messages }) => {
      console.log('[onStart]', {
        model: typeof model === 'string' ? model : 'factory',
        messageCount: messages.length,
      });
    },
    experimental_onStepStart: async ({ stepNumber, model }) => {
      console.log('[onStepStart]', {
        stepNumber,
        model: typeof model === 'string' ? model : 'factory',
      });
    },
    experimental_onToolCallStart: async ({ toolCall }) => {
      console.log('[onToolCallStart]', {
        toolName: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
      });
    },
    experimental_onToolCallFinish: async ({ toolCall, result, error }) => {
      console.log('[onToolCallFinish]', {
        toolName: toolCall.toolName,
        result: result !== undefined ? 'ok' : 'n/a',
        error: error !== undefined,
      });
    },
  });

  // WorkflowAgent streams ModelCallStreamPart chunks to the writable
  // in real-time. The route handler converts to UIMessageChunks at the
  // response boundary using createUIMessageChunkTransform().
  const result = await agent.stream({
    messages: modelMessages,
    writable: getWritable<ModelCallStreamPart>(),
    experimental_repairToolCall: repairToolCall as any,
  });

  return { messages: result.messages };
}
