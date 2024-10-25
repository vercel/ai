import { z } from 'zod';

// Copied from ai package
type ExecuteFunction<PARAMETERS, RESULT> =
  | undefined
  | ((
      args: PARAMETERS,
      options: { abortSignal?: AbortSignal },
    ) => Promise<RESULT>);

// Copied from ai package
export type ToolResultContent = Array<
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image';
      data: string; // base64 encoded png image, e.g. screenshot
      mimeType?: string; // e.g. 'image/png';
    }
>;

const Bash20241022Parameters = z.object({
  command: z.string(),
  restart: z.boolean().optional(),
});

/**
 * Creates a tool for running a bash command. Must have name "bash".
 *
 * Image results are supported.
 *
 * @param execute - The function to execute the tool. Optional.
 */
function bashTool_20241022<RESULT>(
  options: {
    execute?: ExecuteFunction<
      {
        /**
         * The bash command to run. Required unless the tool is being restarted.
         */
        command: string;

        /**
         * Specifying true will restart this tool. Otherwise, leave this unspecified.
         */
        restart?: boolean;
      },
      RESULT
    >;
    experimental_toToolResultContent?: (result: RESULT) => ToolResultContent;
  } = {},
): {
  type: 'provider-defined';
  id: 'anthropic.bash_20241022';
  args: {};
  parameters: typeof Bash20241022Parameters;
  execute: ExecuteFunction<z.infer<typeof Bash20241022Parameters>, RESULT>;
  experimental_toToolResultContent?: (result: RESULT) => ToolResultContent;
} {
  return {
    type: 'provider-defined',
    id: 'anthropic.bash_20241022',
    args: {},
    parameters: Bash20241022Parameters,
    execute: options.execute,
    experimental_toToolResultContent: options.experimental_toToolResultContent,
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

/**
 * Creates a tool for editing text. Must have name "str_replace_editor".
 *
 * Image results are supported.
 *
 * @param execute - The function to execute the tool. Optional.
 */
function textEditorTool_20241022<RESULT>(
  options: {
    execute?: ExecuteFunction<
      {
        /**
         * The commands to run. Allowed options are: `view`, `create`, `str_replace`, `insert`, `undo_edit`.
         */
        command: 'view' | 'create' | 'str_replace' | 'insert' | 'undo_edit';

        /**
         * Absolute path to file or directory, e.g. `/repo/file.py` or `/repo`.
         */
        path: string;

        /**
         * Required parameter of `create` command, with the content of the file to be created.
         */
        file_text?: string;

        /**
         * Required parameter of `insert` command. The `new_str` will be inserted AFTER the line `insert_line` of `path`.
         */
        insert_line?: number;

        /**
         * Optional parameter of `str_replace` command containing the new string (if not given, no string will be added). Required parameter of `insert` command containing the string to insert.
         */
        new_str?: string;

        /**
         * Required parameter of `str_replace` command containing the string in `path` to replace.
         */
        old_str?: string;

        /**
         * Optional parameter of `view` command when `path` points to a file. If none is given, the full file is shown. If provided, the file will be shown in the indicated line number range, e.g. [11, 12] will show lines 11 and 12. Indexing at 1 to start. Setting `[start_line, -1]` shows all lines from `start_line` to the end of the file.
         */
        view_range?: number[];
      },
      RESULT
    >;
    experimental_toToolResultContent?: (result: RESULT) => ToolResultContent;
  } = {},
): {
  type: 'provider-defined';
  id: 'anthropic.text_editor_20241022';
  args: {};
  parameters: typeof TextEditor20241022Parameters;
  execute: ExecuteFunction<
    z.infer<typeof TextEditor20241022Parameters>,
    RESULT
  >;
  experimental_toToolResultContent?: (result: RESULT) => ToolResultContent;
} {
  return {
    type: 'provider-defined',
    id: 'anthropic.text_editor_20241022',
    args: {},
    parameters: TextEditor20241022Parameters,
    execute: options.execute,
    experimental_toToolResultContent: options.experimental_toToolResultContent,
  };
}

const Computer20241022Parameters = z.object({
  action: z.enum([
    'key',
    'type',
    'mouse_move',
    'left_click',
    'left_click_drag',
    'right_click',
    'middle_click',
    'double_click',
    'screenshot',
    'cursor_position',
  ]),
  coordinate: z.array(z.number().int()).optional(),
  text: z.string().optional(),
});

/**
 * Creates a tool for executing actions on a computer. Must have name "computer".
 *
 * Image results are supported.
 *
 * @param displayWidthPx - The width of the display being controlled by the model in pixels.
 * @param displayHeightPx - The height of the display being controlled by the model in pixels.
 * @param displayNumber - The display number to control (only relevant for X11 environments). If specified, the tool will be provided a display number in the tool definition.
 * @param execute - The function to execute the tool. Optional.
 */
function computerTool_20241022<RESULT>(options: {
  displayWidthPx: number;
  displayHeightPx: number;
  displayNumber?: number;
  execute?: ExecuteFunction<
    {
      /**
       * The action to perform. The available actions are:
       * - `key`: Press a key or key-combination on the keyboard.
       *   - This supports xdotool's `key` syntax.
       *   - Examples: "a", "Return", "alt+Tab", "ctrl+s", "Up", "KP_0" (for the numpad 0 key).
       * - `type`: Type a string of text on the keyboard.
       * - `cursor_position`: Get the current (x, y) pixel coordinate of the cursor on the screen.
       * - `mouse_move`: Move the cursor to a specified (x, y) pixel coordinate on the screen.
       * - `left_click`: Click the left mouse button.
       * - `left_click_drag`: Click and drag the cursor to a specified (x, y) pixel coordinate on the screen.
       * - `right_click`: Click the right mouse button.
       * - `middle_click`: Click the middle mouse button.
       * - `double_click`: Double-click the left mouse button.
       * - `screenshot`: Take a screenshot of the screen.
       */
      action:
        | 'key'
        | 'type'
        | 'mouse_move'
        | 'left_click'
        | 'left_click_drag'
        | 'right_click'
        | 'middle_click'
        | 'double_click'
        | 'screenshot'
        | 'cursor_position';

      /**
       * (x, y): The x (pixels from the left edge) and y (pixels from the top edge) coordinates to move the mouse to. Required only by `action=mouse_move` and `action=left_click_drag`.
       */
      coordinate?: number[];

      /**
       * Required only by `action=type` and `action=key`.
       */
      text?: string;
    },
    RESULT
  >;
  experimental_toToolResultContent?: (result: RESULT) => ToolResultContent;
}): {
  type: 'provider-defined';
  id: 'anthropic.computer_20241022';
  args: {};
  parameters: typeof Computer20241022Parameters;
  execute: ExecuteFunction<z.infer<typeof Computer20241022Parameters>, RESULT>;
  experimental_toToolResultContent?: (result: RESULT) => ToolResultContent;
} {
  return {
    type: 'provider-defined',
    id: 'anthropic.computer_20241022',
    args: {
      displayWidthPx: options.displayWidthPx,
      displayHeightPx: options.displayHeightPx,
      displayNumber: options.displayNumber,
    },
    parameters: Computer20241022Parameters,
    execute: options.execute,
    experimental_toToolResultContent: options.experimental_toToolResultContent,
  };
}

export const anthropicTools = {
  bash_20241022: bashTool_20241022,
  textEditor_20241022: textEditorTool_20241022,
  computer_20241022: computerTool_20241022,
};
