import {
  experimental_codeModeTool as codeModeTool,
  type CodeModeToolSet,
} from '@ai-sdk/code-mode';
import { createMCPClient } from '@ai-sdk/mcp';
import { generateText, isStepCount, type ModelMessage } from 'ai';
import { run } from '../../lib/run';

const model = 'moonshotai/kimi-k3';

function printMessageHistory(label: string, messages: ModelMessage[]) {
  console.log(
    label,
    JSON.stringify(
      messages.filter(
        message => message.role === 'user' || message.role === 'assistant',
      ),
      null,
      2,
    ),
  );
}

run(async () => {
  const runtimeTools: CodeModeToolSet = {};

  const codeMode = codeModeTool({ toolDiscovery: 'conversation' });
  const modelTools = { code_mode: codeMode } as const;

  const messages: ModelMessage[] = [
    {
      role: 'user',
      content:
        'We will connect more capabilities later. For now, reply with "ready".',
    },
  ];

  const beforeRegistration = await generateText({
    model,
    tools: modelTools,
    experimental_toolCallers: {},
    messages,
    onStepStart: ({ messages }) => {
      printMessageHistory('Before MCP registration history:', messages);
    },
  });
  console.log(
    'Before MCP registration:',
    JSON.stringify(beforeRegistration.content, null, 2),
  );
  messages.push(...beforeRegistration.responseMessages);

  // Connect an MCP server after the conversation has already started.
  const mcpClient = await createMCPClient({
    transport: {
      type: 'http',
      url: 'https://mcpplaygroundonline.com/mcp-complex-server',
    },
  });

  try {
    const definitions = await mcpClient.listTools();
    const mcpTools = mcpClient.toolsFromDefinitions(definitions);

    // Register the MCP tools only with the host-side code mode runtime.
    for (const [name, mcpTool] of Object.entries(mcpTools)) {
      const runtimeName = `playground__${name}`;
      runtimeTools[runtimeName] = mcpTool;
    }

    messages.push({
      role: 'user',
      content:
        'Use the `playground__analyze_data` tool with dataSource "sales", then report the returned value.',
    });

    const tools = { code_mode: codeMode, ...runtimeTools };
    const toolCallers = Object.fromEntries(
      Object.keys(runtimeTools).map(name => [name, ['code_mode'] as const]),
    );

    const afterRegistration = await generateText({
      model,
      tools,
      experimental_toolCallers: toolCallers,
      messages,
      stopWhen: isStepCount(10),
      onStepStart: ({ stepNumber, messages }) => {
        printMessageHistory(
          `After MCP registration history (step ${stepNumber}):`,
          messages,
        );
      },
    });
    console.log(
      'After MCP registration:',
      JSON.stringify(afterRegistration.content, null, 2),
    );
  } finally {
    await mcpClient.close();
  }
});
