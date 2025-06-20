import { LanguageModelV2ToolResultPart } from '@ai-sdk/provider';
import { z } from 'zod';
import { computer_20241022 } from './tool/computer_20241022';
import { textEditor_20241022 } from './tool/textEditor_20241022';
import { textEditor_20250124 } from './tool/textEditor_20250124';
import { bash_20241022 } from './tool/bash_20241022';
import { bash_20250124 } from './tool/bash_20250124';
import { webSearch_20250305 } from './tool/webSearch_20250305';

// TODO remove
type ExecuteFunction<PARAMETERS, RESULT> =
  | undefined
  | ((
      args: PARAMETERS,
      options: { abortSignal?: AbortSignal },
    ) => Promise<RESULT>);

const Computer20250124Parameters = z.object({
  action: z.enum([
    'key',
    'hold_key',
    'type',
    'cursor_position',
    'mouse_move',
    'left_mouse_down',
    'left_mouse_up',
    'left_click',
    'left_click_drag',
    'right_click',
    'middle_click',
    'double_click',
    'triple_click',
    'scroll',
    'wait',
    'screenshot',
  ]),
  coordinate: z.tuple([z.number().int(), z.number().int()]).optional(),
  duration: z.number().optional(),
  scroll_amount: z.number().optional(),
  scroll_direction: z.enum(['up', 'down', 'left', 'right']).optional(),
  start_coordinate: z.tuple([z.number().int(), z.number().int()]).optional(),
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
function computerTool_20250124<RESULT>(options: {
  displayWidthPx: number;
  displayHeightPx: number;
  displayNumber?: number;
  execute?: ExecuteFunction<
    {
      /**
       * - `key`: Press a key or key-combination on the keyboard.
       *   - This supports xdotool's `key` syntax.
       *   - Examples: "a", "Return", "alt+Tab", "ctrl+s", "Up", "KP_0" (for the numpad 0 key).
       * - `hold_key`: Hold down a key or multiple keys for a specified duration (in seconds). Supports the same syntax as `key`.
       * - `type`: Type a string of text on the keyboard.
       * - `cursor_position`: Get the current (x, y) pixel coordinate of the cursor on the screen.
       * - `mouse_move`: Move the cursor to a specified (x, y) pixel coordinate on the screen.
       * - `left_mouse_down`: Press the left mouse button.
       * - `left_mouse_up`: Release the left mouse button.
       * - `left_click`: Click the left mouse button at the specified (x, y) pixel coordinate on the screen. You can also include a key combination to hold down while clicking using the `text` parameter.
       * - `left_click_drag`: Click and drag the cursor from `start_coordinate` to a specified (x, y) pixel coordinate on the screen.
       * - `right_click`: Click the right mouse button at the specified (x, y) pixel coordinate on the screen.
       * - `middle_click`: Click the middle mouse button at the specified (x, y) pixel coordinate on the screen.
       * - `double_click`: Double-click the left mouse button at the specified (x, y) pixel coordinate on the screen.
       * - `triple_click`: Triple-click the left mouse button at the specified (x, y) pixel coordinate on the screen.
       * - `scroll`: Scroll the screen in a specified direction by a specified amount of clicks of the scroll wheel, at the specified (x, y) pixel coordinate. DO NOT use PageUp/PageDown to scroll.
       * - `wait`: Wait for a specified duration (in seconds).
       * - `screenshot`: Take a screenshot of the screen.
       */
      action:
        | 'key'
        | 'hold_key'
        | 'type'
        | 'cursor_position'
        | 'mouse_move'
        | 'left_mouse_down'
        | 'left_mouse_up'
        | 'left_click'
        | 'left_click_drag'
        | 'right_click'
        | 'middle_click'
        | 'double_click'
        | 'triple_click'
        | 'scroll'
        | 'wait'
        | 'screenshot';

      /**
       * (x, y): The x (pixels from the left edge) and y (pixels from the top edge) coordinates to move the mouse to. Required only by `action=mouse_move` and `action=left_click_drag`.
       */
      coordinate?: [number, number];

      /**
       * The duration to hold the key down for. Required only by `action=hold_key` and `action=wait`.
       */
      duration?: number;

      /**
       * The number of 'clicks' to scroll. Required only by `action=scroll`.
       */
      scroll_amount?: number;

      /**
       * The direction to scroll the screen. Required only by `action=scroll`.
       */
      scroll_direction?: 'up' | 'down' | 'left' | 'right';

      /**
       * (x, y): The x (pixels from the left edge) and y (pixels from the top edge) coordinates to start the drag from. Required only by `action=left_click_drag`.
       */
      start_coordinate?: [number, number];

      /**
       * Required only by `action=type`, `action=key`, and `action=hold_key`. Can also be used by click or scroll actions to hold down keys while clicking or scrolling.
       */
      text?: string;
    },
    RESULT
  >;
  toModelOutput?: (result: RESULT) => LanguageModelV2ToolResultPart['output'];
}): {
  type: 'provider-defined-client';
  id: 'anthropic.computer_20250124';
  args: {};
  parameters: typeof Computer20250124Parameters;
  execute: ExecuteFunction<z.infer<typeof Computer20250124Parameters>, RESULT>;
  toModelOutput?: (result: RESULT) => LanguageModelV2ToolResultPart['output'];
} {
  return {
    type: 'provider-defined-client',
    id: 'anthropic.computer_20250124',
    args: {
      displayWidthPx: options.displayWidthPx,
      displayHeightPx: options.displayHeightPx,
      displayNumber: options.displayNumber,
    },
    parameters: Computer20250124Parameters,
    execute: options.execute,
    toModelOutput: options.toModelOutput,
  };
}

export const anthropicTools = {
  /**
   * Creates a tool for running a bash command. Must have name "bash".
   *
   * Image results are supported.
   *
   * @param execute - The function to execute the tool. Optional.
   */
  bash_20241022,

  /**
   * Creates a tool for running a bash command. Must have name "bash".
   *
   * Image results are supported.
   *
   * @param execute - The function to execute the tool. Optional.
   */
  bash_20250124,

  /**
   * Creates a tool for editing text. Must have name "str_replace_editor".
   */
  textEditor_20241022,

  /**
   * Creates a tool for editing text. Must have name "str_replace_editor".
   */
  textEditor_20250124,

  /**
   * Creates a tool for executing actions on a computer. Must have name "computer".
   *
   * Image results are supported.
   *
   * @param displayWidthPx - The width of the display being controlled by the model in pixels.
   * @param displayHeightPx - The height of the display being controlled by the model in pixels.
   * @param displayNumber - The display number to control (only relevant for X11 environments). If specified, the tool will be provided a display number in the tool definition.
   */
  computer_20241022,

  computer_20250124: computerTool_20250124,

  /**
   * Creates a web search tool that gives Claude direct access to real-time web content.
   * Must have name "web_search".
   *
   * @param maxUses - Maximum number of web searches Claude can perform during the conversation.
   * @param allowedDomains - Optional list of domains that Claude is allowed to search.
   * @param blockedDomains - Optional list of domains that Claude should avoid when searching.
   * @param userLocation - Optional user location information to provide geographically relevant search results.
   */
  webSearch_20250305,
};
