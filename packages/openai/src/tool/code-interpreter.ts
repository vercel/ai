import { z } from 'zod/v4';

/**
 * Parameters schema for the code interpreter tool.
 */
const CodeInterpreterParameters = z.object({
  container: z.object({
    type: z.literal('auto'),
  }),
});

/**
 * Creates a code interpreter tool configuration.
 * @returns A provider-defined tool configuration for the code interpreter.
 */
type CodeInterpreterParametersType = z.infer<typeof CodeInterpreterParameters>;

function codeInterpreterTool({}: {} = {}): {
  type: 'provider-defined';
  id: 'openai.code_interpreter';
  args: {};
  parameters: CodeInterpreterParametersType;
} {
  return {
    type: 'provider-defined',
    id: 'openai.code_interpreter',
    args: {},
    parameters: {
      container: { type: 'auto' as const },
    },
  };
}

export const codeInterpreter = codeInterpreterTool;
