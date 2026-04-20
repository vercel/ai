import type { Context, ModelMessage, ToolSet } from '@ai-sdk/provider-utils';
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
 * - A tool call needs approval via `toolApproval` or tool-level `needsApproval`, or
 * - A stop condition is met (default stop condition is isStepCount(20))
 */
export class ToolLoopAgent<
  CALL_OPTIONS = never,
  TOOLS extends ToolSet = {},
  RUNTIME_CONTEXT extends Context = Context,
  OUTPUT extends Output = never,
> implements Agent<CALL_OPTIONS, TOOLS, RUNTIME_CONTEXT, OUTPUT> {
  readonly version = 'agent-v1';

  private readonly settings: ToolLoopAgentSettings<
    CALL_OPTIONS,
    TOOLS,
    RUNTIME_CONTEXT,
    OUTPUT
  >;

  constructor(
    settings: ToolLoopAgentSettings<
      CALL_OPTIONS,
      TOOLS,
      RUNTIME_CONTEXT,
      OUTPUT
    >,
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
    prompt?: string | Array<ModelMessage>;
    messages?: Array<ModelMessage>;
    options?: CALL_OPTIONS;
  }): Promise<
    Omit<
      ToolLoopAgentSettings<CALL_OPTIONS, TOOLS, RUNTIME_CONTEXT, OUTPUT>,
      | 'prepareCall'
      | 'instructions'
      | 'experimental_onStart'
      | 'experimental_onStepStart'
      | 'experimental_onToolExecutionStart'
      | 'experimental_onToolExecutionEnd'
      | 'onStepFinish'
      | 'onFinish'
    > &
      Prompt
  > {
    const {
      experimental_onStart: _settingsOnStart,
      experimental_onStepStart: _settingsOnStepStart,
      experimental_onToolExecutionStart: _settingsOnToolExecutionStart,
      experimental_onToolExecutionEnd: _settingsOnToolExecutionEnd,
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
              RUNTIME_CONTEXT,
              OUTPUT
            >['prepareCall']
          >
        >[0],
      )) ?? baseCallArgs;

    const { instructions, messages, prompt, runtimeContext, ...callArgs } =
      preparedCallArgs;

    const promptArgs = { system: instructions, messages, prompt } as Prompt;

    if (runtimeContext === undefined) {
      return {
        ...callArgs,
        ...promptArgs,
      };
    }

    return {
      ...callArgs,
      runtimeContext,
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
    experimental_onToolExecutionStart,
    experimental_onToolExecutionEnd,
    onStepFinish,
    onFinish,
    ...options
  }: AgentCallParameters<CALL_OPTIONS, TOOLS, RUNTIME_CONTEXT>): Promise<
    GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>
  > {
    const generate = generateText<TOOLS, RUNTIME_CONTEXT, OUTPUT>;
    const preparedCall = await this.prepareCall(options);
    const callbackArgs = {
      abortSignal,
      timeout,
      experimental_onStart: mergeCallbacks(
        this.settings.experimental_onStart,
        experimental_onStart as
          | ToolLoopAgentOnStartCallback<TOOLS, RUNTIME_CONTEXT, OUTPUT>
          | undefined,
      ),
      experimental_onStepStart: mergeCallbacks(
        this.settings.experimental_onStepStart,
        experimental_onStepStart as
          | ToolLoopAgentOnStepStartCallback<TOOLS, RUNTIME_CONTEXT, OUTPUT>
          | undefined,
      ),
      experimental_onToolExecutionStart: mergeCallbacks(
        this.settings.experimental_onToolExecutionStart,
        experimental_onToolExecutionStart,
      ),
      experimental_onToolExecutionEnd: mergeCallbacks(
        this.settings.experimental_onToolExecutionEnd,
        experimental_onToolExecutionEnd,
      ),
      onStepFinish: mergeCallbacks(this.settings.onStepFinish, onStepFinish),
      onFinish: mergeCallbacks(this.settings.onFinish, onFinish),
    };

    return await generate({
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
    experimental_onToolExecutionStart,
    experimental_onToolExecutionEnd,
    onStepFinish,
    onFinish,
    ...options
  }: AgentStreamParameters<CALL_OPTIONS, TOOLS, RUNTIME_CONTEXT>): Promise<
    StreamTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>
  > {
    const stream = streamText<TOOLS, RUNTIME_CONTEXT, OUTPUT>;
    const preparedCall = await this.prepareCall(options);
    const callbackArgs = {
      abortSignal,
      timeout,
      experimental_transform,
      experimental_onStart: mergeCallbacks(
        this.settings.experimental_onStart,
        experimental_onStart as
          | ToolLoopAgentOnStartCallback<TOOLS, RUNTIME_CONTEXT, OUTPUT>
          | undefined,
      ),
      experimental_onStepStart: mergeCallbacks(
        this.settings.experimental_onStepStart,
        experimental_onStepStart as
          | ToolLoopAgentOnStepStartCallback<TOOLS, RUNTIME_CONTEXT, OUTPUT>
          | undefined,
      ),
      experimental_onToolExecutionStart: mergeCallbacks(
        this.settings.experimental_onToolExecutionStart,
        experimental_onToolExecutionStart,
      ),
      experimental_onToolExecutionEnd: mergeCallbacks(
        this.settings.experimental_onToolExecutionEnd,
        experimental_onToolExecutionEnd,
      ),
      onStepFinish: mergeCallbacks(this.settings.onStepFinish, onStepFinish),
      onFinish: mergeCallbacks(this.settings.onFinish, onFinish),
    };

    return await stream({
      ...preparedCall,
      ...callbackArgs,
    } as unknown as Parameters<typeof stream>[0]);
  }
}
