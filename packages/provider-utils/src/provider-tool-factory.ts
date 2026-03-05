import { tool, Tool, ToolExecuteFunction } from './types/tool';
import { FlexibleSchema } from './schema';
import { Context } from './types/context';

export type ProviderToolFactory<
  CONTEXT extends Context,
  INPUT,
  ARGS extends object,
> = <OUTPUT>(
  options: ARGS & {
    execute?: ToolExecuteFunction<CONTEXT, INPUT, OUTPUT>;
    needsApproval?: Tool<CONTEXT, INPUT, OUTPUT>['needsApproval'];
    toModelOutput?: Tool<CONTEXT, INPUT, OUTPUT>['toModelOutput'];
    onInputStart?: Tool<CONTEXT, INPUT, OUTPUT>['onInputStart'];
    onInputDelta?: Tool<CONTEXT, INPUT, OUTPUT>['onInputDelta'];
    onInputAvailable?: Tool<CONTEXT, INPUT, OUTPUT>['onInputAvailable'];
  },
) => Tool<CONTEXT, INPUT, OUTPUT>;

export function createProviderToolFactory<
  CONTEXT extends Context,
  INPUT,
  ARGS extends object,
>({
  id,
  inputSchema,
}: {
  id: `${string}.${string}`;
  inputSchema: FlexibleSchema<INPUT>;
}): ProviderToolFactory<CONTEXT, INPUT, ARGS> {
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
    execute?: ToolExecuteFunction<CONTEXT, INPUT, OUTPUT>;
    outputSchema?: FlexibleSchema<OUTPUT>;
    needsApproval?: Tool<CONTEXT, INPUT, OUTPUT>['needsApproval'];
    toModelOutput?: Tool<CONTEXT, INPUT, OUTPUT>['toModelOutput'];
    onInputStart?: Tool<CONTEXT, INPUT, OUTPUT>['onInputStart'];
    onInputDelta?: Tool<CONTEXT, INPUT, OUTPUT>['onInputDelta'];
    onInputAvailable?: Tool<CONTEXT, INPUT, OUTPUT>['onInputAvailable'];
  }): Tool<CONTEXT, INPUT, OUTPUT> =>
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
  CONTEXT extends Context,
  INPUT,
  OUTPUT,
  ARGS extends object,
> = (
  options: ARGS & {
    execute?: ToolExecuteFunction<CONTEXT, INPUT, OUTPUT>;
    needsApproval?: Tool<CONTEXT, INPUT, OUTPUT>['needsApproval'];
    toModelOutput?: Tool<CONTEXT, INPUT, OUTPUT>['toModelOutput'];
    onInputStart?: Tool<CONTEXT, INPUT, OUTPUT>['onInputStart'];
    onInputDelta?: Tool<CONTEXT, INPUT, OUTPUT>['onInputDelta'];
    onInputAvailable?: Tool<CONTEXT, INPUT, OUTPUT>['onInputAvailable'];
  },
) => Tool<CONTEXT, INPUT, OUTPUT>;

export function createProviderToolFactoryWithOutputSchema<
  CONTEXT extends Context,
  INPUT,
  OUTPUT,
  ARGS extends object,
>({
  id,
  inputSchema,
  outputSchema,
  supportsDeferredResults,
}: {
  id: `${string}.${string}`;
  inputSchema: FlexibleSchema<INPUT>;
  outputSchema: FlexibleSchema<OUTPUT>;
  /**
   * Whether this provider-executed tool supports deferred results.
   *
   * When true, the tool result may not be returned in the same turn as the
   * tool call (e.g., when using programmatic tool calling where a server tool
   * triggers a client-executed tool, and the server tool's result is deferred
   * until the client tool is resolved).
   *
   * @default false
   */
  supportsDeferredResults?: boolean;
}): ProviderToolFactoryWithOutputSchema<CONTEXT, INPUT, OUTPUT, ARGS> {
  return ({
    execute,
    needsApproval,
    toModelOutput,
    onInputStart,
    onInputDelta,
    onInputAvailable,
    ...args
  }: ARGS & {
    execute?: ToolExecuteFunction<CONTEXT, INPUT, OUTPUT>;
    needsApproval?: Tool<CONTEXT, INPUT, OUTPUT>['needsApproval'];
    toModelOutput?: Tool<CONTEXT, INPUT, OUTPUT>['toModelOutput'];
    onInputStart?: Tool<CONTEXT, INPUT, OUTPUT>['onInputStart'];
    onInputDelta?: Tool<CONTEXT, INPUT, OUTPUT>['onInputDelta'];
    onInputAvailable?: Tool<CONTEXT, INPUT, OUTPUT>['onInputAvailable'];
  }): Tool<CONTEXT, INPUT, OUTPUT> =>
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
      supportsDeferredResults,
    });
}
