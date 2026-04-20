import { tool, Tool } from './types/tool';
import { FlexibleSchema } from './schema';
import { Context } from './types/context';
/**
 * A provider-executed tool is a tool for which the provider executes the tool.
 */
export type ProviderExecutedToolFactory<
  INPUT,
  OUTPUT,
  ARGS extends object,
  CONTEXT extends Context = {},
> = (
  options: ARGS & {
    onInputStart?: Tool<INPUT, OUTPUT, CONTEXT>['onInputStart'];
    onInputDelta?: Tool<INPUT, OUTPUT, CONTEXT>['onInputDelta'];
    onInputAvailable?: Tool<INPUT, OUTPUT, CONTEXT>['onInputAvailable'];
  },
) => Tool<INPUT, OUTPUT, CONTEXT>;

export function createProviderExecutedToolFactory<
  INPUT,
  OUTPUT,
  ARGS extends object,
  CONTEXT extends Context = {},
>({
  id,
  inputSchema,
  outputSchema,
}: {
  id: `${string}.${string}`;
  inputSchema: FlexibleSchema<INPUT>;
  outputSchema: FlexibleSchema<OUTPUT>;
}): ProviderExecutedToolFactory<INPUT, OUTPUT, ARGS, CONTEXT> {
  return ({
    onInputStart,
    onInputDelta,
    onInputAvailable,
    ...args
  }: ARGS & {
    onInputStart?: Tool<INPUT, OUTPUT, CONTEXT>['onInputStart'];
    onInputDelta?: Tool<INPUT, OUTPUT, CONTEXT>['onInputDelta'];
    onInputAvailable?: Tool<INPUT, OUTPUT, CONTEXT>['onInputAvailable'];
  }): Tool<INPUT, OUTPUT, CONTEXT> =>
    tool({
      type: 'provider',
      isProviderExecuted: true,
      id,
      args,
      inputSchema,
      outputSchema,
      onInputStart,
      onInputDelta,
      onInputAvailable,
    });
}
