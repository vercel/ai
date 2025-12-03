import { tool, Tool, ToolExecuteFunction } from './types/tool';
import { FlexibleSchema } from './schema';

export type ProviderToolFactory<INPUT, ARGS extends object> = <OUTPUT>(
  options: ARGS & {
    execute?: ToolExecuteFunction<INPUT, OUTPUT>;
    needsApproval?: Tool<INPUT, OUTPUT>['needsApproval'];
    toModelOutput?: Tool<INPUT, OUTPUT>['toModelOutput'];
    onInputStart?: Tool<INPUT, OUTPUT>['onInputStart'];
    onInputDelta?: Tool<INPUT, OUTPUT>['onInputDelta'];
    onInputAvailable?: Tool<INPUT, OUTPUT>['onInputAvailable'];
  },
) => Tool<INPUT, OUTPUT>;

export function createProviderToolFactory<INPUT, ARGS extends object>({
  id,
  inputSchema,
}: {
  id: `${string}.${string}`;
  inputSchema: FlexibleSchema<INPUT>;
}): ProviderToolFactory<INPUT, ARGS> {
  return <OUTPUT>({
    execute,
    outputSchema,
    needsApproval,
    toModelOutput,
    onInputStart,
    onInputDelta,
    onInputAvailable,
    ...args
  }: ARGS & {
    execute?: ToolExecuteFunction<INPUT, OUTPUT>;
    outputSchema?: FlexibleSchema<OUTPUT>;
    needsApproval?: Tool<INPUT, OUTPUT>['needsApproval'];
    toModelOutput?: Tool<INPUT, OUTPUT>['toModelOutput'];
    onInputStart?: Tool<INPUT, OUTPUT>['onInputStart'];
    onInputDelta?: Tool<INPUT, OUTPUT>['onInputDelta'];
    onInputAvailable?: Tool<INPUT, OUTPUT>['onInputAvailable'];
  }): Tool<INPUT, OUTPUT> =>
    tool({
      type: 'provider',
      id,
      args,
      inputSchema,
      outputSchema,
      execute,
      needsApproval,
      toModelOutput,
      onInputStart,
      onInputDelta,
      onInputAvailable,
    });
}

export type ProviderToolFactoryWithOutputSchema<
  INPUT,
  OUTPUT,
  ARGS extends object,
> = (
  options: ARGS & {
    execute?: ToolExecuteFunction<INPUT, OUTPUT>;
    needsApproval?: Tool<INPUT, OUTPUT>['needsApproval'];
    toModelOutput?: Tool<INPUT, OUTPUT>['toModelOutput'];
    onInputStart?: Tool<INPUT, OUTPUT>['onInputStart'];
    onInputDelta?: Tool<INPUT, OUTPUT>['onInputDelta'];
    onInputAvailable?: Tool<INPUT, OUTPUT>['onInputAvailable'];
  },
) => Tool<INPUT, OUTPUT>;

export function createProviderToolFactoryWithOutputSchema<
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
}): ProviderToolFactoryWithOutputSchema<INPUT, OUTPUT, ARGS> {
  return ({
    execute,
    needsApproval,
    toModelOutput,
    onInputStart,
    onInputDelta,
    onInputAvailable,
    ...args
  }: ARGS & {
    execute?: ToolExecuteFunction<INPUT, OUTPUT>;
    needsApproval?: Tool<INPUT, OUTPUT>['needsApproval'];
    toModelOutput?: Tool<INPUT, OUTPUT>['toModelOutput'];
    onInputStart?: Tool<INPUT, OUTPUT>['onInputStart'];
    onInputDelta?: Tool<INPUT, OUTPUT>['onInputDelta'];
    onInputAvailable?: Tool<INPUT, OUTPUT>['onInputAvailable'];
  }): Tool<INPUT, OUTPUT> =>
    tool({
      type: 'provider',
      id,
      args,
      inputSchema,
      outputSchema,
      execute,
      needsApproval,
      toModelOutput,
      onInputStart,
      onInputDelta,
      onInputAvailable,
    });
}
