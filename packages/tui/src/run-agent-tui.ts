import { AgentTUIRunner } from "./agent-tui-runner";
import type { Agent } from "ai";

/**
 * Controls how terminal UI sections for stream parts are displayed.
 */
export type TerminalPartDisplayMode = "full" | "collapsed" | "auto-collapsed" | "hidden";

/**
 * Controls which usage statistic is shown for assistant responses.
 */
export type AssistantResponseStatsMode = "tokens" | "tokensPerSecond";

/**
 * An agent that is compatible with the terminal UI.
 *
 * It has no call options and no structured output.
 */
export type AgentTUIAgent = Agent<undefined, any, any, never>;

/**
 * Options for starting an agent in the default terminal UI.
 */
export type RunAgentTUIOptions = {
  /**
   * The agent to run.
   */
  agent: AgentTUIAgent;

  /**
   * The title shown in the terminal UI.
   */
  name: string;

  /**
   * How tool calls should render.
   */
  tools?: TerminalPartDisplayMode;

  /**
   * How reasoning parts should render.
   */
  reasoning?: TerminalPartDisplayMode;

  /**
   * Which statistic to show in assistant response headers.
   *
   * @default "tokensPerSecond"
   */
  assistantResponseStats?: AssistantResponseStatsMode;

  /**
   * The model context window size in tokens.
   *
   * When provided, the terminal UI shows the current total token usage as a
   * percentage of this context window.
   */
  contextSize?: number;
};

/**
 * Runs an agent in the default terminal UI until the user exits.
 */
export async function runAgentTUI(options: RunAgentTUIOptions) {
  await new AgentTUIRunner(options).run();
}
