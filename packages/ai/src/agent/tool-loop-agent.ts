import { generateText } from '../generate-text/generate-text';
import { GenerateTextResult } from '../generate-text/generate-text-result';
import { Output } from '../generate-text/output';
import { StepResult } from '../generate-text/step-result';
import { stepCountIs } from '../generate-text/stop-condition';
import { streamText } from '../generate-text/stream-text';
import { StreamTextResult } from '../generate-text/stream-text-result';
import { ToolSet } from '../generate-text/tool-set';
import { Prompt } from '../prompt';
import { Agent, AgentCallParameters, AgentStreamParameters } from './agent';
import { ToolLoopAgentOnStartCallback } from './tool-loop-agent-on-start-callback';
import { ToolLoopAgentOnStepFinishCallback } from './tool-loop-agent-on-step-finish-callback';
import { ToolLoopAgentOnStepStartCallback } from './tool-loop-agent-on-step-start-callback';
import { ToolLoopAgentOnToolCallFinishCallback } from './tool-loop-agent-on-tool-call-finish-callback';
import { ToolLoopAgentOnToolCallStartCallback } from './tool-loop-agent-on-tool-call-start-callback';
import { ToolLoopAgentSettings } from './tool-loop-agent-settings';

/**
 * A tool loop agent is an agent that runs tools in a loop. In each step,
 * it calls the LLM, and if there are tool calls, it executes the tools
 * and calls the LLM again in a new step with the tool results.
 *
 * The loop continues until:
 * - A finish reasoning other than tool-calls is returned, or
 * - A tool that is invoked does not have an execute function, or
 * - A tool call needs approval, or
 * - A stop condition is met (default stop condition is stepCountIs(20))
 */
export class ToolLoopAgent<
  CALL_OPTIONS = never,
  TOOLS extends ToolSet = {},
  OUTPUT extends Output = never,
> implements Agent<CALL_OPTIONS, TOOLS, OUTPUT>
{
  readonly version = 'agent-v1';

  private readonly settings: ToolLoopAgentSettings<CALL_OPTIONS, TOOLS, OUTPUT>;

  constructor(settings: ToolLoopAgentSettings<CALL_OPTIONS, TOOLS, OUTPUT>) {
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
      ToolLoopAgentSettings<CALL_OPTIONS, TOOLS, OUTPUT>,
      | 'prepareCall'
      | 'instructions'
      | 'experimental_onStart'
      | 'experimental_onStepStart'
      | 'experimental_onToolCallStart'
      | 'experimental_onToolCallFinish'
      | 'onStepFinish'
    > &
      Prompt
  > {
    const {
      experimental_onStart: _settingsOnStart,
      experimental_onStepStart: _settingsOnStepStart,
      experimental_onToolCallStart: _settingsOnToolCallStart,
      experimental_onToolCallFinish: _settingsOnToolCallFinish,
      onStepFinish: _settingsOnStepFinish,
      ...settingsWithoutCallbacks
    } = this.settings;

    const baseCallArgs = {
      ...settingsWithoutCallbacks,
      stopWhen: this.settings.stopWhen ?? stepCountIs(20),
      ...options,
    };

    const preparedCallArgs =
      (await this.settings.prepareCall?.(
        baseCallArgs as Parameters<
          NonNullable<
            ToolLoopAgentSettings<CALL_OPTIONS, TOOLS, OUTPUT>['prepareCall']
          >
        >[0],
      )) ?? baseCallArgs;

    const { instructions, messages, prompt, ...callArgs } = preparedCallArgs;

    return {
      ...callArgs,

      // restore prompt types
      ...({ system: instructions, messages, prompt } as Prompt),
    };
  }

  private mergeOnStartCallbacks(
    methodCallback: ToolLoopAgentOnStartCallback<TOOLS, OUTPUT> | undefined,
  ): ToolLoopAgentOnStartCallback<TOOLS, OUTPUT> | undefined {
    const constructorCallback = this.settings.experimental_onStart;

    if (methodCallback && constructorCallback) {
      return async event => {
        await constructorCallback(event);
        await methodCallback(event);
      };
    }

    return methodCallback ?? constructorCallback;
  }

  private mergeOnStepStartCallbacks(
    methodCallback: ToolLoopAgentOnStepStartCallback<TOOLS, OUTPUT> | undefined,
  ): ToolLoopAgentOnStepStartCallback<TOOLS, OUTPUT> | undefined {
    const constructorCallback = this.settings.experimental_onStepStart;

    if (methodCallback && constructorCallback) {
      return async event => {
        await constructorCallback(event);
        await methodCallback(event);
      };
    }

    return methodCallback ?? constructorCallback;
  }

  private mergeOnToolCallStartCallbacks(
    methodCallback: ToolLoopAgentOnToolCallStartCallback<TOOLS> | undefined,
  ): ToolLoopAgentOnToolCallStartCallback<TOOLS> | undefined {
    const constructorCallback = this.settings.experimental_onToolCallStart;

    if (methodCallback && constructorCallback) {
      return async event => {
        await constructorCallback(event);
        await methodCallback(event);
      };
    }

    return methodCallback ?? constructorCallback;
  }

  private mergeOnToolCallFinishCallbacks(
    methodCallback: ToolLoopAgentOnToolCallFinishCallback<TOOLS> | undefined,
  ): ToolLoopAgentOnToolCallFinishCallback<TOOLS> | undefined {
    const constructorCallback = this.settings.experimental_onToolCallFinish;

    if (methodCallback && constructorCallback) {
      return async event => {
        await constructorCallback(event);
        await methodCallback(event);
      };
    }

    return methodCallback ?? constructorCallback;
  }

  private mergeOnStepFinishCallbacks(
    methodCallback: ToolLoopAgentOnStepFinishCallback<TOOLS> | undefined,
  ): ToolLoopAgentOnStepFinishCallback<TOOLS> | undefined {
    const constructorCallback = this.settings.onStepFinish;

    if (methodCallback && constructorCallback) {
      return async (stepResult: StepResult<TOOLS>) => {
        await constructorCallback(stepResult);
        await methodCallback(stepResult);
      };
    }

    return methodCallback ?? constructorCallback;
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
    ...options
  }: AgentCallParameters<CALL_OPTIONS, TOOLS>): Promise<
    GenerateTextResult<TOOLS, OUTPUT>
  > {
    return generateText({
      ...(await this.prepareCall(options)),
      abortSignal,
      timeout,
      experimental_onStart: this.mergeOnStartCallbacks(experimental_onStart),
      experimental_onStepStart: this.mergeOnStepStartCallbacks(
        experimental_onStepStart,
      ),
      experimental_onToolCallStart: this.mergeOnToolCallStartCallbacks(
        experimental_onToolCallStart,
      ),
      experimental_onToolCallFinish: this.mergeOnToolCallFinishCallbacks(
        experimental_onToolCallFinish,
      ),
      onStepFinish: this.mergeOnStepFinishCallbacks(onStepFinish),
    });
  }

  /**
   * Streams an output from the agent (streaming).
   */
  async stream({
    abortSignal,
    timeout,
    experimental_transform,
    experimental_onStart: _onStart,
    experimental_onStepStart: _onStepStart,
    experimental_onToolCallStart: _onToolCallStart,
    experimental_onToolCallFinish: _onToolCallFinish,
    onStepFinish,
    ...options
  }: AgentStreamParameters<CALL_OPTIONS, TOOLS>): Promise<
    StreamTextResult<TOOLS, OUTPUT>
  > {
    return streamText({
      ...(await this.prepareCall(options)),
      abortSignal,
      timeout,
      experimental_transform,
      onStepFinish: this.mergeOnStepFinishCallbacks(onStepFinish),
    });
  }
}
