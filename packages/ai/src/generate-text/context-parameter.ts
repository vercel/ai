import {
  Context,
  HasRequiredKey,
  InferToolSetContext,
  ToolSet,
} from '@ai-sdk/provider-utils';

/**
 * Helper type to make the context parameter optional or required based on the tool set and user context.
 */
// TODO simplify to ToolsContextParameter once coupling is removed
export type ContextParameter<
  TOOLS extends ToolSet,
  USER_CONTEXT extends Context,
> = {
  tools?: TOOLS;
} & (HasRequiredKey<InferToolSetContext<TOOLS>> extends true
  ? {
      /**
       * User-defined runtime context.
       *
       * Treat the context object as immutable inside tools.
       * Mutating the context object can lead to race conditions and unexpected results
       * when tools are called in parallel.
       *
       * If you need to mutate the context, analyze the tool calls and results
       * in `prepareStep` and update it there.
       */
      context: USER_CONTEXT;

      toolsContext: InferToolSetContext<TOOLS>;
    }
  : HasRequiredKey<USER_CONTEXT> extends true
    ? {
        /**
         * User-defined runtime context.
         *
         * Treat the context object as immutable inside tools.
         * Mutating the context object can lead to race conditions and unexpected results
         * when tools are called in parallel.
         *
         * If you need to mutate the context, analyze the tool calls and results
         * in `prepareStep` and update it there.
         */
        context: USER_CONTEXT;

        toolsContext?: never;
      }
    : { context?: never; toolsContext?: never });
