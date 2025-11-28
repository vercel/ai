import { bash_20241022 } from './tool/bash_20241022';
import { bash_20250124 } from './tool/bash_20250124';
import { codeExecution_20250522 } from './tool/code-execution_20250522';
import { codeExecution_20250825 } from './tool/code-execution_20250825';
import { computer_20241022 } from './tool/computer_20241022';
import { computer_20250124 } from './tool/computer_20250124';
import { memory_20250818 } from './tool/memory_20250818';
import { textEditor_20241022 } from './tool/text-editor_20241022';
import { textEditor_20250124 } from './tool/text-editor_20250124';
import { textEditor_20250429 } from './tool/text-editor_20250429';
import { textEditor_20250728 } from './tool/text-editor_20250728';
import { toolSearch_20251119 } from './tool/tool-search_20251119';
import { webFetch_20250910 } from './tool/web-fetch-20250910';
import { webSearch_20250305 } from './tool/web-search_20250305';

export const anthropicTools = {
  /**
   * The bash tool enables Claude to execute shell commands in a persistent bash session,
   * allowing system operations, script execution, and command-line automation.
   *
   * Image results are supported.
   *
   * Tool name must be `bash`.
   */
  bash_20241022,

  /**
   * The bash tool enables Claude to execute shell commands in a persistent bash session,
   * allowing system operations, script execution, and command-line automation.
   *
   * Image results are supported.
   *
   * Tool name must be `bash`.
   */
  bash_20250124,

  /**
   * Claude can analyze data, create visualizations, perform complex calculations,
   * run system commands, create and edit files, and process uploaded files directly within
   * the API conversation.
   *
   * The code execution tool allows Claude to run Bash commands and manipulate files,
   * including writing code, in a secure, sandboxed environment.
   *
   * Tool name must be `code_execution`.
   */
  codeExecution_20250522,

  /**
   * Claude can analyze data, create visualizations, perform complex calculations,
   * run system commands, create and edit files, and process uploaded files directly within
   * the API conversation.
   *
   * The code execution tool allows Claude to run both Python and Bash commands and manipulate files,
   * including writing code, in a secure, sandboxed environment.
   *
   * This is the latest version with enhanced Bash support and file operations.
   *
   * Tool name must be `code_execution`.
   */
  codeExecution_20250825,

  /**
   * Claude can interact with computer environments through the computer use tool, which
   * provides screenshot capabilities and mouse/keyboard control for autonomous desktop interaction.
   *
   * Image results are supported.
   *
   * Tool name must be `computer`.
   *
   * @param displayWidthPx - The width of the display being controlled by the model in pixels.
   * @param displayHeightPx - The height of the display being controlled by the model in pixels.
   * @param displayNumber - The display number to control (only relevant for X11 environments). If specified, the tool will be provided a display number in the tool definition.
   */
  computer_20241022,

  /**
   * Claude can interact with computer environments through the computer use tool, which
   * provides screenshot capabilities and mouse/keyboard control for autonomous desktop interaction.
   *
   * Image results are supported.
   *
   * Tool name must be `computer`.
   *
   * @param displayWidthPx - The width of the display being controlled by the model in pixels.
   * @param displayHeightPx - The height of the display being controlled by the model in pixels.
   * @param displayNumber - The display number to control (only relevant for X11 environments). If specified, the tool will be provided a display number in the tool definition.
   */
  computer_20250124,

  /**
   * The memory tool enables Claude to store and retrieve information across conversations through a memory file directory.
   * Claude can create, read, update, and delete files that persist between sessions,
   * allowing it to build knowledge over time without keeping everything in the context window.
   * The memory tool operates client-side—you control where and how the data is stored through your own infrastructure.
   *
   * Supported models: Claude Sonnet 4.5, Claude Sonnet 4, Claude Opus 4.1, Claude Opus 4.
   *
   * Tool name must be `memory`.
   */
  memory_20250818,

  /**
   * Claude can use an Anthropic-defined text editor tool to view and modify text files,
   * helping you debug, fix, and improve your code or other text documents. This allows Claude
   * to directly interact with your files, providing hands-on assistance rather than just suggesting changes.
   *
   * Supported models: Claude Sonnet 3.5
   *
   * Tool name must be `str_replace_editor`.
   */
  textEditor_20241022,

  /**
   * Claude can use an Anthropic-defined text editor tool to view and modify text files,
   * helping you debug, fix, and improve your code or other text documents. This allows Claude
   * to directly interact with your files, providing hands-on assistance rather than just suggesting changes.
   *
   * Supported models: Claude Sonnet 3.7
   *
   * Tool name must be `str_replace_editor`.
   */
  textEditor_20250124,

  /**
   * Claude can use an Anthropic-defined text editor tool to view and modify text files,
   * helping you debug, fix, and improve your code or other text documents. This allows Claude
   * to directly interact with your files, providing hands-on assistance rather than just suggesting changes.
   *
   * Note: This version does not support the "undo_edit" command.
   *
   * Tool name must be `str_replace_based_edit_tool`.
   *
   * @deprecated Use textEditor_20250728 instead
   */
  textEditor_20250429,

  /**
   * Claude can use an Anthropic-defined text editor tool to view and modify text files,
   * helping you debug, fix, and improve your code or other text documents. This allows Claude
   * to directly interact with your files, providing hands-on assistance rather than just suggesting changes.
   *
   * Note: This version does not support the "undo_edit" command and adds optional max_characters parameter.
   *
   * Supported models: Claude Sonnet 4, Opus 4, and Opus 4.1
   *
   * Tool name must be `str_replace_based_edit_tool`.
   *
   * @param maxCharacters - Optional maximum number of characters to view in the file
   */
  textEditor_20250728,

  /**
   * Creates a web fetch tool that gives Claude direct access to real-time web content.
   *
   * Tool name must be `web_fetch`.
   *
   * @param maxUses - The max_uses parameter limits the number of web fetches performed
   * @param allowedDomains - Only fetch from these domains
   * @param blockedDomains - Never fetch from these domains
   * @param citations - Unlike web search where citations are always enabled, citations are optional for web fetch. Set "citations": {"enabled": true} to enable Claude to cite specific passages from fetched documents.
   * @param maxContentTokens - The max_content_tokens parameter limits the amount of content that will be included in the context.
   */
  webFetch_20250910,

  /**
   * Creates a web search tool that gives Claude direct access to real-time web content.
   *
   * Tool name must be `web_search`.
   *
   * @param maxUses - Maximum number of web searches Claude can perform during the conversation.
   * @param allowedDomains - Optional list of domains that Claude is allowed to search.
   * @param blockedDomains - Optional list of domains that Claude should avoid when searching.
   * @param userLocation - Optional user location information to provide geographically relevant search results.
   */
  webSearch_20250305,

  /**
   * Creates a Tool Search Tool that enables Claude to dynamically discover tools on-demand.
   *
   * The Tool Search Tool allows Claude to search for relevant tools using regex patterns
   * rather than loading all tool definitions upfront. This can significantly reduce token usage
   * (up to 85% reduction) when working with many tools.
   *
   * Use this tool in combination with `deferLoading: true` on your other tools to enable
   * dynamic tool discovery.
   *
   * Tool name must be `tool_search_tool_regex`.
   *
   * @see https://www.anthropic.com/engineering/advanced-tool-use
   */
  toolSearch_20251119,
};
