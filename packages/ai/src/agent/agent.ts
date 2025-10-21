import { ModelMessage } from '@ai-sdk/provider-utils';
import { GenerateTextResult } from '../generate-text/generate-text-result';
import {
  InferGenerateOutput,
  InferStreamOutput,
  Output,
} from '../generate-text/output';
import { StreamTextResult } from '../generate-text/stream-text-result';
import { ToolSet } from '../generate-text/tool-set';

export type AgentCallParameters<CALL_OPTIONS> = ([CALL_OPTIONS] extends [never]
  ? { options?: never }
  : { options: CALL_OPTIONS }) &
  (
    | {
        /**
         * A prompt. It can be either a text prompt or a list of messages.
         *
         * You can either use `prompt` or `messages` but not both.
         */
        prompt: string | Array<ModelMessage>;

        /**
         * A list of messages.
         *
         * You can either use `prompt` or `messages` but not both.
         */
        messages?: never;
      }
    | {
        /**
         * A list of messages.
         *
         * You can either use `prompt` or `messages` but not both.
         */
        messages: Array<ModelMessage>;

        /**
         * A prompt. It can be either a text prompt or a list of messages.
         *
         * You can either use `prompt` or `messages` but not both.
         */
        prompt?: never;
      }
  );

/**
 * An Agent receives a prompt (text or messages) and generates or streams an output
 * that consists of steps, tool calls, data parts, etc.
 *
 * You can implement your own Agent by implementing the `Agent` interface,
 * or use the `ToolLoopAgent` class.
 */
export interface Agent<
  CALL_OPTIONS = never,
  TOOLS extends ToolSet = {},
  OUTPUT extends Output = never,
> {
  /**
   * The specification version of the agent interface. This will enable
   * us to evolve the agent interface and retain backwards compatibility.
   */
  readonly version: 'agent-v1';

  /**
   * The id of the agent.
   */
  readonly id: string | undefined;

  /**
   * The tools that the agent can use.
   */
  readonly tools: TOOLS;

  /**
   * Generates an output from the agent (non-streaming).
   */
  generate(
    options: AgentCallParameters<CALL_OPTIONS>,
  ): PromiseLike<GenerateTextResult<TOOLS, InferGenerateOutput<OUTPUT>>>;

  /**
   * Streams an output from the agent (streaming).
   */
  stream(
    options: AgentCallParameters<CALL_OPTIONS>,
  ): PromiseLike<StreamTextResult<TOOLS, InferStreamOutput<OUTPUT>>>;
}
