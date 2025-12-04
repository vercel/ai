import { anthropic } from '@ai-sdk/anthropic';
import { InferAgentUIMessage, tool, ToolLoopAgent, UIToolInvocation } from 'ai';
import { z } from 'zod';

const getWeatherTool = tool({
  description: 'Get the current weather at a specific location',
  inputSchema: z.object({
    location: z.string().describe('The city and state, e.g. San Francisco, CA'),
    unit: z
      .enum(['celsius', 'fahrenheit'])
      .optional()
      .describe('Temperature unit'),
  }),
  execute: async ({ location, unit = 'fahrenheit' }) => ({
    location,
    temperature: unit === 'celsius' ? 18 : 64,
    condition: 'Partly cloudy',
    humidity: 65,
  }),
  providerOptions: {
    anthropic: { deferLoading: true },
  },
});

const sendEmailTool = tool({
  description: 'Send an email to a recipient with a subject and body',
  inputSchema: z.object({
    to: z.string().describe('Recipient email address'),
    subject: z.string().describe('Email subject'),
    body: z.string().describe('Email body content'),
  }),
  execute: async ({ to, subject }) => ({
    success: true,
    message: `Email sent to ${to}`,
    subject,
  }),
  providerOptions: {
    anthropic: { deferLoading: true },
  },
});

export const anthropicToolSearchAgent = new ToolLoopAgent({
  model: anthropic('claude-sonnet-4-5'),
  tools: {
    toolSearch: anthropic.tools.toolSearchBm25_20251119(),
    get_weather: getWeatherTool,
    send_email: sendEmailTool,
  },
});

export type AnthropicToolSearchAgentMessage = InferAgentUIMessage<
  typeof anthropicToolSearchAgent
>;

export type GetWeatherUIToolInvocation = UIToolInvocation<
  typeof getWeatherTool
>;
export type SendEmailUIToolInvocation = UIToolInvocation<typeof sendEmailTool>;
