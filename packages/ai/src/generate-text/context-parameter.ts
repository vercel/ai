import { ToolSet } from '@ai-sdk/provider-utils';
import { GenerationContext } from './generation-context';

// This helper type helps to make the context parameter optional or required
// based on the context type. It is needed for correct type validation when
// there are tools with a context schema.
export type ContextParameter<
  TOOLS extends ToolSet,
  CONTEXT extends GenerationContext<TOOLS> = GenerationContext<TOOLS>,
> = {} extends CONTEXT
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
      context?: CONTEXT;
    }
  : {
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
      context: CONTEXT;
    };
