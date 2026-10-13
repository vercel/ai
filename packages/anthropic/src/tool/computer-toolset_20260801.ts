import {
  createProviderToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

/**
 * Member tools of the computer toolset. Each member is returned by the API as
 * its own `tool_use` block; the AI SDK exposes it as the `action` of a single
 * computer tool call.
 */
export const computerToolset_20260801Members = [
  'screenshot',
  'zoom',
  'left_click',
  'right_click',
  'middle_click',
  'double_click',
  'triple_click',
  'left_click_drag',
  'mouse_move',
  'left_mouse_down',
  'left_mouse_up',
  'cursor_position',
  'scroll',
  'type',
  'key',
  'hold_key',
  'wait',
] as const;

export type ComputerToolset_20260801Member =
  (typeof computerToolset_20260801Members)[number];

const computerToolset_20260801InputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      action: z.enum(computerToolset_20260801Members),
      coordinate: z.tuple([z.number().int(), z.number().int()]).optional(),
      duration: z.number().optional(),
      region: z
        .tuple([
          z.number().int(),
          z.number().int(),
          z.number().int(),
          z.number().int(),
        ])
        .optional(),
      repeat: z.number().int().optional(),
      scroll_amount: z.number().optional(),
      scroll_direction: z.enum(['up', 'down', 'left', 'right']).optional(),
      start_coordinate: z
        .tuple([z.number().int(), z.number().int()])
        .optional(),
      text: z.string().optional(),
    }),
  ),
);

export const computerToolset_20260801ArgsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      configs: z
        .partialRecord(
          z.enum(computerToolset_20260801Members),
          z.object({
            enabled: z.boolean().optional(),
            deferLoading: z.boolean().optional(),
          }),
        )
        .optional(),
    }),
  ),
);

export const computerToolset_20260801 = createProviderToolFactory<
  {
    /**
     * The member tool that Claude invoked. Each member is returned by the API
     * as a separate `tool_use` block; the AI SDK maps it to the `action`.
     *
     * - `screenshot`: Capture the full display as an image.
     * - `zoom`: Capture a `region` of the screen at full resolution.
     * - `left_click`, `right_click`, `middle_click`, `double_click`, `triple_click`: Click at `coordinate`. `text` may hold modifier keys to hold while clicking.
     * - `left_click_drag`: Drag from `start_coordinate` to `coordinate`.
     * - `mouse_move`: Move the cursor to `coordinate` without clicking.
     * - `left_mouse_down`, `left_mouse_up`: Press or release the left mouse button at the current position.
     * - `cursor_position`: Report the current cursor position as text.
     * - `scroll`: Scroll `scroll_amount` clicks in `scroll_direction` at `coordinate`.
     * - `type`: Type the literal `text`.
     * - `key`: Press a key or key combination (`text`), optionally `repeat` times.
     * - `hold_key`: Hold a key or key combination (`text`) for `duration` seconds.
     * - `wait`: Pause for `duration` seconds.
     */
    action: ComputerToolset_20260801Member;

    /**
     * (x, y): Pixel coordinates in the space of the screenshots you return.
     */
    coordinate?: [number, number];

    /**
     * Duration in seconds. Used by `hold_key` and `wait`.
     */
    duration?: number;

    /**
     * [x1, y1, x2, y2]: The region to zoom into. Used by `zoom`.
     */
    region?: [number, number, number, number];

    /**
     * How many times to press the key. Used by `key`.
     */
    repeat?: number;

    /**
     * The number of scroll wheel clicks. Used by `scroll`.
     */
    scroll_amount?: number;

    /**
     * The direction to scroll. Used by `scroll`.
     */
    scroll_direction?: 'up' | 'down' | 'left' | 'right';

    /**
     * (x, y): Where a drag starts. Used by `left_click_drag`.
     */
    start_coordinate?: [number, number];

    /**
     * Text to type, a key combination to press or hold, or modifier keys to
     * hold during click and scroll actions.
     */
    text?: string;
  },
  {
    /**
     * Per-member configuration. Members you omit keep their defaults
     * (all members enabled, including `zoom`).
     */
    configs?: Partial<
      Record<
        ComputerToolset_20260801Member,
        {
          /**
           * Whether Claude can use this member tool. Default: true.
           */
          enabled?: boolean;

          /**
           * Whether this member tool is only loaded once discovered through
           * tool search. Default: false.
           */
          deferLoading?: boolean;
        }
      >
    >;
  }
>({
  id: 'anthropic.computer_toolset_20260801',
  inputSchema: computerToolset_20260801InputSchema,
});
