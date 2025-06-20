import { Tool, ToolExecuteFunction, ToolInputSchema } from './types/tool';

export type ProviderDefinedClientToolFactory<INPUT, ARGS extends object> = <
  OUTPUT,
>(
  options: ARGS & {
    execute?: ToolExecuteFunction<INPUT, OUTPUT>;
    toModelOutput?: Tool<INPUT, OUTPUT>['toModelOutput'];
    onInputStart?: Tool<INPUT, OUTPUT>['onInputStart'];
    onInputDelta?: Tool<INPUT, OUTPUT>['onInputDelta'];
    onInputAvailable?: Tool<INPUT, OUTPUT>['onInputAvailable'];
  },
) => Tool<INPUT, OUTPUT>;

export function createProviderDefinedClientToolFactory<
  INPUT,
  ARGS extends object,
>({
  id,
  inputSchema,
}: {
  id: string;
  inputSchema: ToolInputSchema<INPUT>;
}): ProviderDefinedClientToolFactory<INPUT, ARGS> {
  return <OUTPUT>({
    execute,
    toModelOutput,
    onInputStart,
    onInputDelta,
    onInputAvailable,
    ...args
  }: ARGS & {
    execute?: ToolExecuteFunction<INPUT, OUTPUT>;
    toModelOutput?: Tool<INPUT, OUTPUT>['toModelOutput'];
    onInputStart?: Tool<INPUT, OUTPUT>['onInputStart'];
    onInputDelta?: Tool<INPUT, OUTPUT>['onInputDelta'];
    onInputAvailable?: Tool<INPUT, OUTPUT>['onInputAvailable'];
  }): Tool<INPUT, OUTPUT> =>
    ({
      type: 'provider-defined-client',
      id,
      args,
      inputSchema,
      execute,
      toModelOutput,
      onInputStart,
      onInputDelta,
      onInputAvailable,
    }) as Tool<INPUT, OUTPUT>;
}
