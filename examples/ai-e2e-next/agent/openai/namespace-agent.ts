import { openai, OpenAILanguageModelResponsesOptions } from '@ai-sdk/openai';
import { InferAgentUIMessage, tool, ToolLoopAgent } from 'ai';
import { z } from 'zod';

const weatherTool = tool({
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
});

const searchFilesTool = tool({
  description: 'Search through files in the workspace',
  inputSchema: z.object({
    query: z.string().describe('The search query'),
    file_types: z.array(z.string()).optional().describe('Filter by file types'),
  }),
  execute: async ({ query }) => ({
    results: [
      `document1.pdf - Contains "${query}" on page 3`,
      `notes.txt - Found "${query}" in title`,
      `report.docx - "${query}" mentioned in summary`,
    ],
  }),
});

const sendEmailTool = tool({
  description: 'Send an email to a recipient',
  inputSchema: z.object({
    to: z.string().describe('Recipient email address'),
    subject: z.string().describe('Email subject'),
    body: z.string().describe('Email body content'),
  }),
  execute: async ({ to, subject }) => ({
    success: true,
    message: `Email sent to ${to} with subject: ${subject}`,
    timestamp: new Date().toISOString(),
  }),
});

export const openaiNamespaceAgent = new ToolLoopAgent({
  model: openai.responses('gpt-5.4'),
  instructions:
    'You are a helpful assistant with access to weather, file search, and email tools organized in namespaces.',
  tools: {
    toolSearch: openai.tools.toolSearch(),

    // Group tools by domain using namespaces
    weatherNamespace: openai.tools.namespace({
      name: 'weather_tools',
      description: 'Tools for getting weather information',
      tools: [
        {
          type: 'function',
          name: 'get_weather',
          description: 'Get the current weather at a specific location',
          defer_loading: true,
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string', description: 'The city and state' },
              unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
            },
            required: ['location'],
          },
        },
      ],
    }),

    productivityNamespace: openai.tools.namespace({
      name: 'productivity_tools',
      description: 'Tools for file search and email',
      tools: [
        {
          type: 'function',
          name: 'search_files',
          description: 'Search through files in the workspace',
          defer_loading: true,
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'The search query' },
              file_types: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by file types',
              },
            },
            required: ['query'],
          },
        },
        {
          type: 'function',
          name: 'send_email',
          description: 'Send an email to a recipient',
          defer_loading: true,
          parameters: {
            type: 'object',
            properties: {
              to: { type: 'string', description: 'Recipient email' },
              subject: { type: 'string', description: 'Email subject' },
              body: { type: 'string', description: 'Email body' },
            },
            required: ['to', 'subject', 'body'],
          },
        },
      ],
    }),

    // Tool execution handlers
    get_weather: weatherTool,
    search_files: searchFilesTool,
    send_email: sendEmailTool,
  },
  onStepFinish: ({ request }) => {
    console.dir(request.body, { depth: Infinity });
  },
  providerOptions: {
    openai: {
      store: false,
    } satisfies OpenAILanguageModelResponsesOptions,
  },
});

export type OpenAINamespaceMessage = InferAgentUIMessage<
  typeof openaiNamespaceAgent
>;
