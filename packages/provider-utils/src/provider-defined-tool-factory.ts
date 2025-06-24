import { tool, Tool, ToolExecuteFunction } from './types/tool';
import { FlexibleSchema } from './schema';

export type ProviderDefinedToolFactory<INPUT, ARGS extends object> = <OUTPUT>(
  options: ARGS & {
    execute?: ToolExecuteFunction<INPUT, OUTPUT>;
    toModelOutput?: Tool<INPUT, OUTPUT>['toModelOutput'];
    onInputStart?: Tool<INPUT, OUTPUT>['onInputStart'];
    onInputDelta?: Tool<INPUT, OUTPUT>['onInputDelta'];
    onInputAvailable?: Tool<INPUT, OUTPUT>['onInputAvailable'];
  },
) => Tool<INPUT, OUTPUT>;

export function createProviderDefinedToolFactory<INPUT, ARGS extends object>({
  id,
  name,
  inputSchema,
}: {
  id: `${string}.${string}`;
  name: string;
  inputSchema: FlexibleSchema<INPUT>;
}): ProviderDefinedToolFactory<INPUT, ARGS> {
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
      name,
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

export type ProviderDefinedToolFactoryWithOutputSchema<
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

export function createProviderDefinedToolFactoryWithOutputSchema<
  INPUT,
  OUTPUT,
  ARGS extends object,
>({
  id,
  name,
  inputSchema,
  outputSchema,
}: {
  id: `${string}.${string}`;
  name: string;
  inputSchema: FlexibleSchema<INPUT>;
  outputSchema: FlexibleSchema<OUTPUT>;
}): ProviderDefinedToolFactoryWithOutputSchema<INPUT, OUTPUT, ARGS> {
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
      name,
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
