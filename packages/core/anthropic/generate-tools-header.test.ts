import { UnsupportedJSONSchemaError } from '../spec';
import { generateToolsHeader } from './generate-tools-header';

it('should throw unsupported schema error when parameter is string', async () => {
  await expect(async () =>
    generateToolsHeader({
      provider: 'anthropic.messages',
      tools: [
        {
          type: 'function',
          name: 'my-function',
          parameters: {
            type: 'string',
            $schema: 'http://json-schema.org/draft-07/schema#',
          },
        },
      ],
    }),
  ).rejects.toThrowError(UnsupportedJSONSchemaError);
});

it('should generate tools header for a single tool with single string parameter', async () => {
  const toolsHeader = generateToolsHeader({
    provider: 'anthropic.messages',
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
  });

  expect(toolsHeader).toMatchSnapshot();
});

it('should generate tools header for two tools with single parameter each', async () => {
  const toolsHeader = generateToolsHeader({
    provider: 'anthropic.messages',
    tools: [
      {
        type: 'function',
        name: 'my-function-1',
        parameters: {
          type: 'object',
          properties: { first: { type: 'boolean' } },
          required: ['first'],
          additionalProperties: false,
          $schema: 'http://json-schema.org/draft-07/schema#',
        },
      },
      {
        type: 'function',
        name: 'my-function-2',
        parameters: {
          type: 'object',
          properties: { second: { type: 'number' } },
          required: ['second'],
          additionalProperties: false,
          $schema: 'http://json-schema.org/draft-07/schema#',
        },
      },
    ],
  });

  expect(toolsHeader).toMatchSnapshot();
});
