import { bash_20241022 } from './tool/bash_20241022';
import { bash_20250124 } from './tool/bash_20250124';
import { computer_20241022 } from './tool/computer_20241022';
import { computer_20250124 } from './tool/computer_20250124';
import { textEditor_20241022 } from './tool/text-editor_20241022';
import { textEditor_20250124 } from './tool/text-editor_20250124';
import { textEditor_20250429 } from './tool/text-editor_20250429';
import { webSearch_20250305 } from './tool/web-search_20250305';

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
   * Creates a tool for editing text. Must have name "str_replace_based_edit_tool".
   * Note: This version does not support the "undo_edit" command.
   */
  textEditor_20250429,

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
  computer_20250124,

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
