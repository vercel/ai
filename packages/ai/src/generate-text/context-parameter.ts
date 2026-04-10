import {
  InferToolContext,
  InferToolSetContext,
  ToolSet,
} from '@ai-sdk/provider-utils';
import { GenerationContext } from './generation-context';
import { Context } from '@ai-sdk/provider-utils';

type HasRequiredKey<CONTEXT> = {} extends CONTEXT ? false : true;
export type ContextParameter<
  TOOLS extends ToolSet,
  USER_CONTEXT extends Context,
> = {
  tools?: TOOLS;
} & (HasRequiredKey<InferToolSetContext<TOOLS>> extends true
  ? { context: InferToolSetContext<TOOLS> & USER_CONTEXT }
  : HasRequiredKey<USER_CONTEXT> extends true
    ? { context: USER_CONTEXT }
    : { context?: never });

// type HasRequiredToolContext<TOOLS extends ToolSet> = {
//   [NAME in keyof TOOLS]: {} extends InferToolContext<NoInfer<TOOLS[NAME]>>
//     ? never
//     : NAME;
// }[keyof TOOLS] extends never
//   ? false
//   : true;

// // This helper type helps to make the context parameter optional or required
// // based on the context type. It is needed for correct type validation when
// // there are tools with a context schema.
// export type ContextParameter<
//   TOOLS extends ToolSet,
//   CONTEXT extends GenerationContext<TOOLS> = GenerationContext<TOOLS>,
// > = {
//   /**
//    * The tools that the model can call. The model needs to support calling tools.
//    */
//   tools?: TOOLS;
// } & (HasRequiredToolContext<NoInfer<TOOLS>> extends true
//   ? {
//       /**
//        * User-defined runtime context.
//        *
//        * Treat the context object as immutable inside tools.
//        * Mutating the context object can lead to race conditions and unexpected results
//        * when tools are called in parallel.
//        *
//        * If you need to mutate the context, analyze the tool calls and results
//        * in `prepareStep` and update it there.
//        */
//       context: CONTEXT;
//     }
//   : {} extends CONTEXT
//     ? {
//         /**
//          * User-defined runtime context.
//          *
//          * Treat the context object as immutable inside tools.
//          * Mutating the context object can lead to race conditions and unexpected results
//          * when tools are called in parallel.
//          *
//          * If you need to mutate the context, analyze the tool calls and results
//          * in `prepareStep` and update it there.
//          */
//         context?: CONTEXT;
//       }
//     : {
//         /**
//          * User-defined runtime context.
//          *
//          * Treat the context object as immutable inside tools.
//          * Mutating the context object can lead to race conditions and unexpected results
//          * when tools are called in parallel.
//          *
//          * If you need to mutate the context, analyze the tool calls and results
//          * in `prepareStep` and update it there.
//          */
//         context: CONTEXT;
//       });
