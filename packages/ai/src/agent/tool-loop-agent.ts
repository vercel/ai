import type { Context, ToolSet } from '@ai-sdk/provider-utils';
import { generateText } from '../generate-text/generate-text';
import { GenerateTextResult } from '../generate-text/generate-text-result';
import { Output } from '../generate-text/output';
import { isStepCount } from '../generate-text/stop-condition';
import { streamText } from '../generate-text/stream-text';
import { StreamTextResult } from '../generate-text/stream-text-result';
import { Prompt } from '../prompt';
import { mergeCallbacks } from '../util/merge-callbacks';
import { Agent, AgentCallParameters, AgentStreamParameters } from './agent';
import {
  ToolLoopAgentOnStartCallback,
  ToolLoopAgentOnStepStartCallback,
  ToolLoopAgentSettings,
} from './tool-loop-agent-settings';

/**
 * A tool loop agent is an agent that runs tools in a loop. In each step,
 * it calls the LLM, and if there are tool calls, it executes the tools
 * and calls the LLM again in a new step with the tool results.
 *
 * The loop continues until:
 * - A finish reasoning other than tool-calls is returned, or
 * - A tool that is invoked does not have an execute function, or
 * - A tool call needs approval via `toolNeedsApproval` or tool-level `needsApproval`, or
 * - A stop condition is met (default stop condition is isStepCount(20))
 */
export class ToolLoopAgent<
  CALL_OPTIONS = never,
  TOOLS extends ToolSet = {},
  USER_CONTEXT extends Context = Context,
  OUTPUT extends Output = never,
> implements Agent<CALL_OPTIONS, TOOLS, USER_CONTEXT, OUTPUT> {
  readonly version = 'agent-v1';

  private readonly settings: ToolLoopAgentSettings<
    CALL_OPTIONS,
    TOOLS,
    USER_CONTEXT,
    OUTPUT
  >;

  constructor(
    settings: ToolLoopAgentSettings<CALL_OPTIONS, TOOLS, USER_CONTEXT, OUTPUT>,
  ) {
    this.settings = settings;
  }

  /**
   * The id of the agent.
   */
  get id(): string | undefined {
    return this.settings.id;
  }

  /**
   * The tools that the agent can use.
   */
  get tools(): TOOLS {
    return this.settings.tools as TOOLS;
  }

  private async prepareCall(options: {
    prompt?: string | Array<import('@ai-sdk/provider-utils').ModelMessage>;
    messages?: Array<import('@ai-sdk/provider-utils').ModelMessage>;
    options?: CALL_OPTIONS;
  }): Promise<
    Omit<
      ToolLoopAgentSettings<CALL_OPTIONS, TOOLS, USER_CONTEXT, OUTPUT>,
      | 'prepareCall'
      | 'instructions'
      | 'experimental_onStart'
      | 'experimental_onStepStart'
      | 'experimental_onToolCallStart'
      | 'experimental_onToolCallFinish'
      | 'onStepFinish'
      | 'onFinish'
    > &
      Prompt
  > {
    const {
      experimental_onStart: _settingsOnStart,
      experimental_onStepStart: _settingsOnStepStart,
      experimental_onToolCallStart: _settingsOnToolCallStart,
      experimental_onToolCallFinish: _settingsOnToolCallFinish,
      onStepFinish: _settingsOnStepFinish,
      onFinish: _settingsOnFinish,
      ...settingsWithoutCallbacks
    } = this.settings;

    const baseCallArgs = {
      ...settingsWithoutCallbacks,
      stopWhen: this.settings.stopWhen ?? isStepCount(20),
      ...options,
    };

    const preparedCallArgs =
      (await this.settings.prepareCall?.(
        baseCallArgs as Parameters<
          NonNullable<
            ToolLoopAgentSettings<
              CALL_OPTIONS,
              TOOLS,
              USER_CONTEXT,
              OUTPUT
            >['prepareCall']
          >
        >[0],
      )) ?? baseCallArgs;

    const { instructions, messages, prompt, context, ...callArgs } =
      preparedCallArgs;
    const promptArgs = { system: instructions, messages, prompt } as Prompt;

    if (context === undefined) {
      return {
        ...callArgs,
        ...promptArgs,
      };
    }

    return {
      ...callArgs,
      context,
      ...promptArgs,
    };
  }

  /**
   * Generates an output from the agent (non-streaming).
   */
  async generate({
    abortSignal,
    timeout,
    experimental_onStart,
    experimental_onStepStart,
    experimental_onToolCallStart,
    experimental_onToolCallFinish,
    onStepFinish,
    onFinish,
    ...options
  }: AgentCallParameters<CALL_OPTIONS, TOOLS, USER_CONTEXT>): Promise<
    GenerateTextResult<TOOLS, USER_CONTEXT, OUTPUT>
  > {
    const generate = generateText<TOOLS, USER_CONTEXT, OUTPUT>;
    const preparedCall = await this.prepareCall(options);
    const callbackArgs = {
      abortSignal,
      timeout,
      experimental_onStart: mergeCallbacks(
        this.settings.experimental_onStart,
        experimental_onStart as
          | ToolLoopAgentOnStartCallback<TOOLS, USER_CONTEXT, OUTPUT>
          | undefined,
      ),
      experimental_onStepStart: mergeCallbacks(
        this.settings.experimental_onStepStart,
        experimental_onStepStart as
          | ToolLoopAgentOnStepStartCallback<TOOLS, USER_CONTEXT, OUTPUT>
          | undefined,
      ),
      experimental_onToolCallStart: mergeCallbacks(
        this.settings.experimental_onToolCallStart,
        experimental_onToolCallStart,
      ),
      experimental_onToolCallFinish: mergeCallbacks(
        this.settings.experimental_onToolCallFinish,
        experimental_onToolCallFinish,
      ),
      onStepFinish: mergeCallbacks(this.settings.onStepFinish, onStepFinish),
      onFinish: mergeCallbacks(this.settings.onFinish, onFinish),
    };

    return generate({
      ...preparedCall,
      ...callbackArgs,
    } as unknown as Parameters<typeof generate>[0]);
  }

  /**
   * Streams an output from the agent (streaming).
   */
  async stream({
    abortSignal,
    timeout,
    experimental_transform,
    experimental_onStart,
    experimental_onStepStart,
    experimental_onToolCallStart,
    experimental_onToolCallFinish,
    onStepFinish,
    onFinish,
    ...options
  }: AgentStreamParameters<CALL_OPTIONS, TOOLS, USER_CONTEXT>): Promise<
    StreamTextResult<TOOLS, USER_CONTEXT, OUTPUT>
  > {
    const stream = streamText<TOOLS, USER_CONTEXT, OUTPUT>;
    const preparedCall = await this.prepareCall(options);
    const callbackArgs = {
      abortSignal,
      timeout,
      experimental_transform,
      experimental_onStart: mergeCallbacks(
        this.settings.experimental_onStart,
        experimental_onStart as
          | ToolLoopAgentOnStartCallback<TOOLS, USER_CONTEXT, OUTPUT>
          | undefined,
      ),
      experimental_onStepStart: mergeCallbacks(
        this.settings.experimental_onStepStart,
        experimental_onStepStart as
          | ToolLoopAgentOnStepStartCallback<TOOLS, USER_CONTEXT, OUTPUT>
          | undefined,
      ),
      experimental_onToolCallStart: mergeCallbacks(
        this.settings.experimental_onToolCallStart,
        experimental_onToolCallStart,
      ),
      experimental_onToolCallFinish: mergeCallbacks(
        this.settings.experimental_onToolCallFinish,
        experimental_onToolCallFinish,
      ),
      onStepFinish: mergeCallbacks(this.settings.onStepFinish, onStepFinish),
      onFinish: mergeCallbacks(this.settings.onFinish, onFinish),
    };

    return stream({
      ...preparedCall,
      ...callbackArgs,
    } as unknown as Parameters<typeof stream>[0]);
  }
}
