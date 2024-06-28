import { z } from 'zod';
import { prepareToolsAndToolChoice } from './prepare-tools-and-tool-choice';
import { CoreTool } from '../tool/tool';

describe('prepareToolsAndToolChoice', () => {
  it('should correctly use zodToJsonSchemaOptions when provided', () => {
    const mockTool: CoreTool = {
      description: 'Test tool',
      parameters: z.object({
        param1: z.string().min(5),
      }),
    };

    const mockTools = {
      testTool: mockTool,
    };

    const zodToJsonSchemaOptions = {
      $refStrategy: 'none',
    } as const;

    const result = prepareToolsAndToolChoice({
      tools: mockTools,
      toolChoice: undefined,
      zodToJsonSchemaOptions,
    });

    expect(result).toEqual({
      tools: [
        {
          description: 'Test tool',
          name: 'testTool',
          parameters: {
            $schema: 'http://json-schema.org/draft-07/schema#',
            additionalProperties: false,
            properties: {
              param1: {
                minLength: 5,
                type: 'string',
              },
            },
            required: ['param1'],
            type: 'object',
          },
          type: 'function',
        },
      ],
      toolChoice: { type: 'auto' },
    });
  });
});
