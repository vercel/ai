import { z } from 'zod';

// TODO use schema instead
type ExecuteFunction<PARAMETERS extends z.ZodTypeAny, RESULT> =
  | undefined
  | ((
      args: z.infer<PARAMETERS>,
      options: { abortSignal?: AbortSignal },
    ) => Promise<RESULT>);

const Bash20241022Parameters = z.object({
  command: z.string(),
  restart: z.boolean().optional(),
});

export function bashTool_20241022<RESULT>(options: {
  execute?: ExecuteFunction<typeof Bash20241022Parameters, RESULT>;
}): {
  type: 'provider-defined';
  id: 'anthropic.bash_20241022';
  args: {};
  parameters: typeof Bash20241022Parameters;
  execute: ExecuteFunction<typeof Bash20241022Parameters, RESULT>;
} {
  return {
    type: 'provider-defined',
    id: 'anthropic.bash_20241022',
    args: {},
    parameters: Bash20241022Parameters,
    execute: options.execute,
  };
}

const TextEditor20241022Parameters = z.object({
  command: z.enum(['view', 'create', 'str_replace', 'insert', 'undo_edit']),
  path: z.string(),
  file_text: z.string().optional(),
  insert_line: z.number().int().optional(),
  new_str: z.string().optional(),
  old_str: z.string().optional(),
  view_range: z.array(z.number().int()).optional(),
});

export function textEditorTool_20241022<RESULT>(options: {
  execute?: ExecuteFunction<typeof TextEditor20241022Parameters, RESULT>;
}): {
  type: 'provider-defined';
  id: 'anthropic.text_editor_20241022';
  args: {};
  parameters: typeof TextEditor20241022Parameters;
  execute: ExecuteFunction<typeof TextEditor20241022Parameters, RESULT>;
} {
  return {
    type: 'provider-defined',
    id: 'anthropic.text_editor_20241022',
    args: {},
    parameters: TextEditor20241022Parameters,
    execute: options.execute,
  };
}
