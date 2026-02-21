import { generateText } from '../generate-text/generate-text';
import { GenerateTextResult } from '../generate-text/generate-text-result';
import { Output } from '../generate-text/output';
import { stepCountIs } from '../generate-text/stop-condition';
import { streamText } from '../generate-text/stream-text';
import { StreamTextResult } from '../generate-text/stream-text-result';
import { ToolSet } from '../generate-text/tool-set';
import { Prompt } from '../prompt';
import { Agent, AgentCallParameters, AgentStreamParameters } from './agent';
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

  private mergeCallbacks<T extends (event: any) => PromiseLike<void> | void>(
    settingsCallback: T | undefined,
    methodCallback: T | undefined,
  ): T | undefined {
    if (methodCallback && settingsCallback) {
      return (async (event: Parameters<T>[0]) => {
        await settingsCallback(event);
        await methodCallback(event);
      }) as unknown as T;
    }
    return methodCallback ?? settingsCallback;
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
  }: AgentCallParameters<CALL_OPTIONS, TOOLS>): Promise<
    GenerateTextResult<TOOLS, OUTPUT>
  > {
    return generateText({
      ...(await this.prepareCall(options)),
      abortSignal,
      timeout,
      experimental_onStart: this.mergeCallbacks(
        this.settings.experimental_onStart,
        experimental_onStart,
      ),
      experimental_onStepStart: this.mergeCallbacks(
        this.settings.experimental_onStepStart,
        experimental_onStepStart,
      ),
      experimental_onToolCallStart: this.mergeCallbacks(
        this.settings.experimental_onToolCallStart,
        experimental_onToolCallStart,
      ),
      experimental_onToolCallFinish: this.mergeCallbacks(
        this.settings.experimental_onToolCallFinish,
        experimental_onToolCallFinish,
      ),
      onStepFinish: this.mergeCallbacks(
        this.settings.onStepFinish,
        onStepFinish,
      ),
      onFinish: this.mergeCallbacks(this.settings.onFinish, onFinish),
    });
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
  }: AgentStreamParameters<CALL_OPTIONS, TOOLS>): Promise<
    StreamTextResult<TOOLS, OUTPUT>
  > {
    return streamText({
      ...(await this.prepareCall(options)),
      abortSignal,
      timeout,
      experimental_transform,
      experimental_onStart: this.mergeCallbacks(
        this.settings.experimental_onStart,
        experimental_onStart,
      ),
      experimental_onStepStart: this.mergeCallbacks(
        this.settings.experimental_onStepStart,
        experimental_onStepStart,
      ),
      experimental_onToolCallStart: this.mergeCallbacks(
        this.settings.experimental_onToolCallStart,
        experimental_onToolCallStart,
      ),
      experimental_onToolCallFinish: this.mergeCallbacks(
        this.settings.experimental_onToolCallFinish,
        experimental_onToolCallFinish,
      ),
      onStepFinish: this.mergeCallbacks(
        this.settings.onStepFinish,
        onStepFinish,
      ),
      onFinish: this.mergeCallbacks(this.settings.onFinish, onFinish),
    });
  }
}
