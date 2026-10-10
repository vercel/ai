import type { Context } from './context';
import type { ModelMessage } from './model-message';
import type { SandboxSession } from './sandbox';

/**
 * The approval decision that authorized a tool execution.
 *
 * Only approved decisions are passed to tool execution. Denied tool calls are
 * not executed and are represented as `execution-denied` tool results instead.
 */
export type ToolExecutionApproval = {
  /**
   * The ID of the approval request.
   */
  approvalId: string;

  /**
   * Whether the tool execution was approved.
   *
   * This is always `true` because denied tool calls are not executed.
   */
  approved: true;

  /**
   * Optional context attached to the approval decision.
   */
  reason?: string;
};

/**
 * Additional options that are sent into each tool execution.
 */
export interface ToolExecutionOptions<
  CONTEXT extends Context | unknown | never,
> {
  /**
   * The ID of the tool call. You can use it e.g. when sending tool-call related information with stream data.
   */
  toolCallId: string;

  /**
   * Messages that were sent to the language model to initiate the response that contained the tool call.
   * The messages **do not** include the system prompt nor the assistant response that contained the tool call.
   */
  messages: ModelMessage[];

  /**
   * An optional abort signal that indicates that the overall operation should be aborted.
   */
  abortSignal?: AbortSignal;

  /**
   * Tool context as defined by the tool's context schema.
   * The tool context is specific to the tool and is passed to the tool execution.
   *
   * Treat the context object as immutable inside tools.
   * Mutating the context object can lead to race conditions and unexpected results
   * when tools are called in parallel.
   *
   * If you need to mutate the context, analyze the tool calls and results
   * in `prepareStep` and update it there.
   */
  context: CONTEXT;

  /**
   * The sandbox environment that the tool is operating in.
   */
  experimental_sandbox?: SandboxSession;

  /**
   * The approval decision that authorized this execution, when the tool call
   * went through an approval flow.
   */
  approval?: ToolExecutionApproval;
}

/**
 * Function that executes the tool and returns either a single result or a stream of results.
 */
export type ToolExecuteFunction<
  INPUT,
  OUTPUT,
  CONTEXT extends Context | unknown | never,
> = (
  input: INPUT,
  options: ToolExecutionOptions<CONTEXT>,
) => AsyncIterable<OUTPUT> | PromiseLike<OUTPUT> | OUTPUT;
