import { tool, Tool, ToolExecuteFunction } from './types/tool';
import { FlexibleSchema } from './schema';

export type ProviderDefinedClientToolFactory<INPUT, ARGS extends object> = <
  OUTPUT,
>(
  options: ARGS & {
    execute?: ToolExecuteFunction<INPUT, OUTPUT>;
    outputSchema?: FlexibleSchema<OUTPUT>;
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
  id: `${string}.${string}`;
  inputSchema: FlexibleSchema<INPUT>;
}): ProviderDefinedClientToolFactory<INPUT, ARGS> {
  return <OUTPUT>({
    execute,
    outputSchema,
    toModelOutput,
    onInputStart,
    onInputDelta,
    onInputAvailable,
    ...args
  }: ARGS & {
    execute?: ToolExecuteFunction<INPUT, OUTPUT>;
    outputSchema?: FlexibleSchema<OUTPUT>;
    toModelOutput?: Tool<INPUT, OUTPUT>['toModelOutput'];
    onInputStart?: Tool<INPUT, OUTPUT>['onInputStart'];
    onInputDelta?: Tool<INPUT, OUTPUT>['onInputDelta'];
    onInputAvailable?: Tool<INPUT, OUTPUT>['onInputAvailable'];
  }): Tool<INPUT, OUTPUT> =>
    tool({
      type: 'provider-defined',
      id,
      args,
      inputSchema,
      outputSchema,
      execute,
      toModelOutput,
      onInputStart,
      onInputDelta,
      onInputAvailable,
    });
}

export type ProviderDefinedServerToolFactory<
  INPUT,
  OUTPUT,
  ARGS extends object,
> = (
  options: ARGS & {
    execute?: ToolExecuteFunction<INPUT, OUTPUT>;
    toModelOutput?: Tool<INPUT, OUTPUT>['toModelOutput'];
    onInputStart?: Tool<INPUT, OUTPUT>['onInputStart'];
    onInputDelta?: Tool<INPUT, OUTPUT>['onInputDelta'];
    onInputAvailable?: Tool<INPUT, OUTPUT>['onInputAvailable'];
  },
) => Tool<INPUT, OUTPUT>;

export function createProviderDefinedServerToolFactory<
  INPUT,
  OUTPUT,
  ARGS extends object,
>({
  id,
  inputSchema,
  outputSchema,
}: {
  id: `${string}.${string}`;
  inputSchema: FlexibleSchema<INPUT>;
  outputSchema: FlexibleSchema<OUTPUT>;
}): ProviderDefinedServerToolFactory<INPUT, OUTPUT, ARGS> {
  return ({
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
    tool({
      type: 'provider-defined',
      id,
      args,
      inputSchema,
      outputSchema,
      execute,
      toModelOutput,
      onInputStart,
      onInputDelta,
      onInputAvailable,
    });
}
