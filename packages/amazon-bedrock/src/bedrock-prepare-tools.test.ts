import { prepareTools } from './bedrock-prepare-tools';

it('should passthrough provider-defined toolChoice for standard tools', () => {
  const result = prepareTools({
    tools: [
      {
        type: 'function',
        name: 'fn',
        description: 'd',
        inputSchema: {},
      },
    ],
    toolChoice: { type: 'provider-defined', toolChoice: { auto: {} } as any },
    modelId: 'amazon.titan-text',
  });
  expect(result.toolConfig.toolChoice).toEqual({ auto: {} });
});
