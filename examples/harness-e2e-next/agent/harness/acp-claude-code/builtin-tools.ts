import { commonTool, type HarnessV1BuiltinTool } from '@ai-sdk/harness';
import { tool } from '@ai-sdk/provider-utils';
import { z } from 'zod';

/*
 * Tool names and inputs were captured from the model request produced by
 * @anthropic-ai/claude-agent-sdk 0.3.217, the version used by the pinned
 * Claude Code ACP implementation.
 */
export const claudeCodeACPBuiltinTools = {
  bash: commonTool('bash', {
    nativeName: 'Bash',
    toolUseKind: 'bash',
    inputSchema: z.object({
      command: z.string(),
      timeout: z.number().optional(),
      description: z.string().optional(),
      run_in_background: z.boolean().optional(),
      dangerouslyDisableSandbox: z.boolean().optional(),
    }),
  }),
  edit: commonTool('edit', {
    nativeName: 'Edit',
    toolUseKind: 'edit',
    inputSchema: z.object({
      file_path: z.string(),
      old_string: z.string(),
      new_string: z.string(),
      replace_all: z.boolean().optional(),
    }),
  }),
  read: commonTool('read', {
    nativeName: 'Read',
    toolUseKind: 'readonly',
    inputSchema: z.object({
      file_path: z.string(),
      offset: z.number().int().nonnegative().optional(),
      limit: z.number().int().positive().optional(),
      pages: z.string().optional(),
    }),
  }),
  webSearch: commonTool('webSearch', {
    nativeName: 'WebSearch',
    toolUseKind: 'readonly',
    inputSchema: z.object({
      query: z.string().min(2),
      allowed_domains: z.array(z.string()).optional(),
      blocked_domains: z.array(z.string()).optional(),
    }),
  }),
  write: commonTool('write', {
    nativeName: 'Write',
    toolUseKind: 'edit',
    inputSchema: z.object({
      file_path: z.string(),
      content: z.string(),
    }),
  }),
  Agent: tool({
    inputSchema: z.object({
      description: z.string(),
      prompt: z.string(),
      subagent_type: z.string().optional(),
      model: z.enum(['sonnet', 'opus', 'haiku', 'fable']).optional(),
      run_in_background: z.boolean().optional(),
      isolation: z.enum(['worktree', 'remote']).optional(),
    }),
  }),
  CronCreate: tool({
    inputSchema: z.object({
      cron: z.string(),
      prompt: z.string(),
      recurring: z.boolean().optional(),
      durable: z.boolean().optional(),
    }),
  }),
  CronDelete: tool({
    inputSchema: z.object({ id: z.string() }),
  }),
  CronList: tool({ inputSchema: z.object({}) }),
  EnterWorktree: tool({
    inputSchema: z.object({
      name: z.string().optional(),
      path: z.string().optional(),
    }),
  }),
  ExitWorktree: tool({
    inputSchema: z.object({
      action: z.enum(['keep', 'remove']),
      discard_changes: z.boolean().optional(),
    }),
  }),
  NotebookEdit: tool({
    inputSchema: z.object({
      notebook_path: z.string(),
      cell_id: z.string().optional(),
      new_source: z.string(),
      cell_type: z.enum(['code', 'markdown']).optional(),
      edit_mode: z.enum(['replace', 'insert', 'delete']).optional(),
    }),
  }),
  ReportFindings: tool({
    inputSchema: z.object({
      level: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
      findings: z
        .array(
          z.object({
            file: z.string(),
            line: z.number().int().optional(),
            summary: z.string(),
            short_summary: z.string().max(60).optional(),
            failure_scenario: z.string(),
            category: z.string().max(40).optional(),
            verdict: z.enum(['CONFIRMED', 'PLAUSIBLE']).optional(),
            outcome: z
              .enum(['fixed', 'skipped', 'no_change_needed'])
              .optional(),
          }),
        )
        .max(32),
    }),
  }),
  ScheduleWakeup: tool({
    inputSchema: z.object({
      delaySeconds: z.number().optional(),
      reason: z.string().optional(),
      prompt: z.string().optional(),
      stop: z.boolean().optional(),
    }),
  }),
  SendMessage: tool({
    inputSchema: z.object({
      to: z.string(),
      summary: z.string().max(200).optional(),
      message: z.string(),
    }),
  }),
  Skill: {
    ...tool({
      inputSchema: z.object({
        skill: z.string(),
        args: z.string().optional(),
      }),
    }),
    toolUseKind: 'readonly',
  },
  TaskCreate: tool({
    inputSchema: z.object({
      subject: z.string(),
      description: z.string(),
      activeForm: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }),
  }),
  TaskGet: tool({
    inputSchema: z.object({ taskId: z.string() }),
  }),
  TaskList: tool({ inputSchema: z.object({}) }),
  TaskOutput: tool({
    inputSchema: z.object({
      task_id: z.string(),
      block: z.boolean(),
      timeout: z.number().min(0).max(600_000),
    }),
  }),
  TaskStop: tool({
    inputSchema: z.object({
      task_id: z.string().optional(),
      shell_id: z.string().optional(),
    }),
  }),
  TaskUpdate: tool({
    inputSchema: z.object({
      taskId: z.string(),
      subject: z.string().optional(),
      description: z.string().optional(),
      activeForm: z.string().optional(),
      status: z
        .enum(['pending', 'in_progress', 'completed', 'deleted'])
        .optional(),
      addBlocks: z.array(z.string()).optional(),
      addBlockedBy: z.array(z.string()).optional(),
      owner: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }),
  }),
  WebFetch: {
    ...tool({
      inputSchema: z.object({
        url: z.string().url(),
        prompt: z.string(),
      }),
    }),
    toolUseKind: 'readonly',
  },
  Workflow: tool({
    inputSchema: z.object({
      script: z.string().max(524_288).optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      title: z.string().optional(),
      args: z.unknown().optional(),
      scriptPath: z.string().optional(),
      resumeFromRunId: z
        .string()
        .regex(/^wf_[a-z0-9-]{6,}$/)
        .optional(),
    }),
  }),
} as const satisfies Record<string, HarnessV1BuiltinTool<any, any>>;
