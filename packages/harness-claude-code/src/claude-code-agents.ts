/**
 * Custom subagent definition passed through to the Claude Agent SDK's
 * `agents` option on `query()`.
 */
export type ClaudeCodeAgentDefinition = {
  /**
   * Natural language description of when to use this subagent.
   */
  readonly description: string;
  /**
   * The subagent's system prompt.
   */
  readonly prompt: string;
  /**
   * Array of allowed tool names. If omitted, inherits all tools from the parent.
   */
  readonly tools?: ReadonlyArray<string>;
  /**
   * Array of tool names to explicitly disallow for this subagent.
   */
  readonly disallowedTools?: ReadonlyArray<string>;
  /**
   * Model alias (e.g. `'sonnet'`, `'opus'`, `'haiku'`) or full model ID.
   * `'inherit'` uses the main model.
   */
  readonly model?: string;
  /**
   * MCP server names or per-server configurations available to this subagent.
   */
  readonly mcpServers?: ReadonlyArray<
    string | Readonly<Record<string, unknown>>
  >;
  /**
   * Experimental: critical reminder added to the subagent's system prompt.
   */
  readonly criticalSystemReminder_EXPERIMENTAL?: string;
  /**
   * Array of skill names to preload into the subagent context.
   */
  readonly skills?: ReadonlyArray<string>;
  /**
   * Auto-submitted as the first user turn when this agent is the main thread agent.
   */
  readonly initialPrompt?: string;
  /**
   * Maximum number of agentic turns before stopping.
   */
  readonly maxTurns?: number;
  /**
   * Token count at which this agent compacts its own conversation when running as a subagent.
   */
  readonly autoCompactWindow?: number;
  /**
   * Run this agent as a background task when invoked.
   */
  readonly background?: boolean;
  /**
   * Run this subagent without loading user, project, and local CLAUDE.md files.
   */
  readonly omitClaudeMd?: boolean;
  /**
   * Scope for auto-loading agent memory files.
   */
  readonly memory?: 'user' | 'project' | 'local';
  /**
   * Reasoning effort level for this subagent.
   */
  readonly effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | number;
  /**
   * Permission mode controlling how tool executions are handled for this subagent.
   */
  readonly permissionMode?:
    | 'default'
    | 'acceptEdits'
    | 'bypassPermissions'
    | 'plan'
    | 'dontAsk'
    | 'auto';
  /**
   * Agent type auto-spawned as a background observer whenever this agent runs.
   */
  readonly observer?: string;
  /**
   * Supplemental postamble appended to each activity digest sent to the observer.
   */
  readonly observerMessage?: string;
};
