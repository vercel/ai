import { prepareTools } from './xai-prepare-tools';

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
    toolChoice: { type: 'provider-defined', toolChoice: 'required' },
  });
  expect(result.toolChoice).toEqual('required');
});
