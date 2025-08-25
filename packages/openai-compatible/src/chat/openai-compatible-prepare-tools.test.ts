import { prepareTools } from './openai-compatible-prepare-tools';

it('should passthrough provider-defined toolChoice', () => {
  const result = prepareTools({
    tools: [
      {
        type: 'function',
        name: 'fn',
        description: 'd',
        inputSchema: {},
      },
    ],
    toolChoice: { type: 'provider-defined', toolChoice: 'auto' },
  });
  expect(result.toolChoice).toEqual('auto');
});
