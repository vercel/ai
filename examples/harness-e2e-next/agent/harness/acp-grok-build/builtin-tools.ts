import { commonTool, type HarnessV1BuiltinTool } from '@ai-sdk/harness';
import { tool } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const nullableString = z.string().nullable().optional();
const nullableBoolean = z.boolean().nullable().optional();

/*
 * Tool names and inputs were captured from the model request produced by
 * @xai-official/grok 0.2.111, the version used by the pinned Grok Build ACP
 * implementation.
 */
export const grokBuildACPBuiltinTools = {
  bash: commonTool('bash', {
    nativeName: 'run_terminal_command',
    toolUseKind: 'bash',
    inputSchema: z.looseObject({
      command: z.string(),
      timeout: z.number().int().min(0).max(36_000_000).nullable().optional(),
      description: z.string().optional(),
      background: z.boolean().optional(),
    }),
  }),
  edit: commonTool('edit', {
    nativeName: 'search_replace',
    toolUseKind: 'edit',
    inputSchema: z.looseObject({
      file_path: z.string(),
      old_string: z.string(),
      new_string: z.string(),
      replace_all: z.boolean().optional(),
    }),
  }),
  grep: commonTool('grep', {
    nativeName: 'grep',
    toolUseKind: 'readonly',
    inputSchema: z.looseObject({
      pattern: z.string(),
      path: nullableString,
      glob: nullableString,
      '-B': z.number().int().optional(),
      '-A': z.number().int().optional(),
      '-C': z.number().int().optional(),
      '-i': z.boolean().optional(),
      type: nullableString,
      head_limit: z.number().int().optional(),
      multiline: z.boolean().optional(),
    }),
  }),
  webSearch: commonTool('webSearch', {
    nativeName: 'web_search',
    toolUseKind: 'readonly',
    inputSchema: z.looseObject({
      query: z.string(),
      allowed_domains: z.array(z.string()).nullable().optional(),
    }),
  }),
  write: commonTool('write', {
    nativeName: 'write',
    toolUseKind: 'edit',
    inputSchema: z.looseObject({
      file_path: z.string(),
      content: z.string(),
    }),
  }),
  read_file: {
    ...tool({
      inputSchema: z.looseObject({
        target_file: z.string(),
        offset: z.number().int().optional(),
        limit: z.number().int().optional(),
        pages: nullableString,
        format: nullableString,
      }),
    }),
    toolUseKind: 'readonly',
  },
  list_dir: {
    ...tool({
      inputSchema: z.looseObject({
        target_directory: z.string(),
      }),
    }),
    toolUseKind: 'readonly',
  },
  kill_command_or_subagent: tool({
    inputSchema: z.looseObject({
      task_id: z.string(),
    }),
  }),
  todo_write: tool({
    inputSchema: z.looseObject({
      merge: z.boolean().optional(),
      todos: z.array(
        z.looseObject({
          id: z.string(),
          content: nullableString,
          status: z
            .enum(['pending', 'in_progress', 'completed', 'cancelled'])
            .nullable()
            .optional(),
        }),
      ),
    }),
  }),
  get_command_or_subagent_output: {
    ...tool({
      inputSchema: z.looseObject({
        task_ids: z.array(z.string()).optional(),
        timeout_ms: z.number().int().nonnegative().nullable().optional(),
      }),
    }),
    toolUseKind: 'readonly',
  },
  spawn_subagent: tool({
    inputSchema: z.looseObject({
      prompt: z.string(),
      description: z.string(),
      subagent_type: z.string().optional(),
      background: z.boolean().optional(),
      capability_mode: z
        .enum(['read-only', 'read-write', 'execute', 'all'])
        .nullable()
        .optional(),
      isolation: z.enum(['none', 'worktree']).nullable().optional(),
      resume_from: nullableString,
      cwd: nullableString,
      model: nullableString,
    }),
  }),
  scheduler_create: tool({
    inputSchema: z.looseObject({
      task_id: nullableString,
      interval: nullableString,
      prompt: nullableString,
      durable: nullableBoolean,
      foreground: nullableBoolean,
      fire_immediately: z.boolean().optional(),
    }),
  }),
  scheduler_delete: tool({
    inputSchema: z.looseObject({ id: z.string() }),
  }),
  scheduler_list: {
    ...tool({ inputSchema: z.looseObject({}) }),
    toolUseKind: 'readonly',
  },
  monitor: tool({
    inputSchema: z.looseObject({
      command: z.string(),
      description: z.string(),
      timeout_ms: z.number().int().nonnegative().nullable().optional(),
      persistent: z.boolean().optional(),
    }),
  }),
  search_tool: {
    ...tool({
      inputSchema: z.looseObject({
        query: z.string(),
        limit: z.number().int().min(0).max(255).nullable().optional(),
      }),
    }),
    toolUseKind: 'readonly',
  },
  use_tool: tool({
    inputSchema: z.looseObject({
      tool_name: z.string(),
      tool_input: z.looseObject({}),
    }),
  }),
  workflow: tool({
    inputSchema: z.looseObject({
      agent_budget: z.number().int().min(1).max(1024).nullable().optional(),
      name: nullableString,
      script: nullableString,
      script_path: nullableString,
      args: z.unknown().optional(),
      resume_from_run_id: nullableString,
      validate_only: z.boolean().optional(),
    }),
  }),
  enter_plan_mode: tool({ inputSchema: z.looseObject({}) }),
  exit_plan_mode: tool({ inputSchema: z.looseObject({}) }),
  ask_user_question: tool({
    inputSchema: z.looseObject({
      questions: z.array(
        z.looseObject({
          question: z.string(),
          options: z.array(
            z.looseObject({
              label: z.string(),
              description: z.string(),
              preview: nullableString,
            }),
          ),
          multi_select: nullableBoolean,
        }),
      ),
    }),
  }),
  image_gen: tool({
    inputSchema: z.looseObject({
      prompt: z.string(),
      aspect_ratio: z.string().optional(),
    }),
  }),
  image_edit: tool({
    inputSchema: z.looseObject({
      prompt: z.string(),
      image: z.array(z.string()),
      aspect_ratio: z.string().optional(),
    }),
  }),
  image_to_video: tool({
    inputSchema: z.looseObject({
      prompt: nullableString,
      image: z.string(),
      duration: z.number().int().nonnegative().nullable().optional(),
      resolution_name: z.string().optional(),
    }),
  }),
  reference_to_video: tool({
    inputSchema: z.looseObject({
      prompt: z.string(),
      images: z.array(z.string()),
      aspect_ratio: z.string(),
      duration: z.number().int().nonnegative().nullable().optional(),
      resolution_name: z.string().optional(),
    }),
  }),
} as const satisfies Record<string, HarnessV1BuiltinTool<any, any>>;
