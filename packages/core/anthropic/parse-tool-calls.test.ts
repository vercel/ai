import { parseToolCalls } from './parse-tool-calls';

it('should generate tools header for a single tool with single string parameter', async () => {
  const { toolCalls, modifiedText } = parseToolCalls({
    text:
      'Some text\n\n' +
      '<function_calls>\n<invoke>\n' +
      '<tool_name>test-tool</tool_name>\n' +
      '<parameters>\n<value>example value</value>\n</parameters>\n' +
      '</invoke>\n',
    tools: [
      {
        type: 'function',
        name: 'my-function',
        description: 'my function description.',
        parameters: {
          type: 'object',
          properties: { param1: { type: 'string' } },
          required: ['param1'],
          additionalProperties: false,
          $schema: 'http://json-schema.org/draft-07/schema#',
        },
      },
    ],
    generateId: () => 'test-id',
  });

  expect(toolCalls).toStrictEqual([
    {
      toolCallType: 'function',
      toolCallId: 'test-id',
      toolName: 'test-tool',
      args: '{"value":"example value"}',
    },
  ]);
  expect(modifiedText).toStrictEqual('Some text\n\n');
});

// TODO test multiple tool calls
// TODO test numbers
// TODO test booleans
