import type { JSONSchema7 } from '@ai-sdk/provider';

/*
 * Hand-copied definitions of fx's kernel tools: their names, descriptions
 * and input schemas, as fx ships them in the release libfx 0.0.16 was built
 * from (fx v0.0.16). libfx does not export these definitions, so they cannot
 * be imported and must be kept up to date manually: whenever the `libfx`
 * dependency is updated, compare every definition in this file against the
 * fx release the new libfx version was built from, update the definitions,
 * and bump `FX_BUILTIN_TOOL_SPECS_LIBFX_VERSION`. A test fails as soon as
 * the installed libfx version differs from that constant.
 *
 * Sources at the pinned release:
 * - https://github.com/vercel-labs/fx/blob/v0.0.16/src/builtins/tools.zig
 *   (descriptions, input schemas, `advertisement_order`)
 * - https://github.com/vercel-labs/fx/blob/v0.0.16/src/core/terminal/contracts.zig
 *   (`max_command_bytes`, the `maxLength` of the shell's `command`)
 * - https://github.com/vercel-labs/fx/blob/v0.0.16/src/core/execution/managed_execution_contract.zig
 *   (`max_wait_ceiling_ms`, the `maximum` of the shell's `yield_time_ms`)
 * - https://github.com/vercel-labs/fx/blob/v0.0.16/src/core/tooling/model_tool_schema.zig
 *   (JSON Schema key order: `type`, `properties`, `additionalProperties`,
 *   `required` for objects and `type`, `enum`, `minLength`, `maxLength`,
 *   `minimum`, `maximum`, `description` for properties)
 *
 * Everything is copied verbatim, except for parts of the shell tool's
 * description, which are documented where they differ.
 */

/**
 * Version of libfx whose fx release the definitions in this file mirror.
 */
export const FX_BUILTIN_TOOL_SPECS_LIBFX_VERSION = '0.0.16';

/**
 * Name of one of fx's kernel tools.
 */
export type FxBuiltinToolName =
  | 'read_file'
  | 'glob_files'
  | 'grep_files'
  | 'edit_file'
  | 'write_file'
  | 'shell';

/**
 * Input of a `read_file` call.
 */
export type FxReadFileInput = {
  /**
   * File path relative to the workspace root, or an external path.
   */
  path: string;

  /**
   * 1-based first line to return.
   */
  start_line?: number;

  /**
   * Number of lines to return.
   */
  line_count?: number;
};

/**
 * Input of a `glob_files` call.
 */
export type FxGlobFilesInput = {
  /**
   * Glob pattern to match.
   */
  pattern: string;

  /**
   * Search root.
   */
  path?: string;

  /**
   * Whether to list matching paths or only count them.
   */
  mode?: 'matches' | 'count';
};

/**
 * Input of a `grep_files` call.
 */
export type FxGrepFilesInput = {
  /**
   * Literal text to search for.
   */
  pattern: string;

  /**
   * Search root.
   */
  path?: string;

  /**
   * Glob pattern that candidate file paths must match.
   */
  include?: string;

  /**
   * Whether to search case-insensitively.
   */
  case_insensitive?: boolean;

  /**
   * Output mode.
   */
  mode?: 'matches' | 'files_with_matches' | 'count';

  /**
   * Maximum number of results to return.
   */
  head_limit?: number;

  /**
   * Zero-based result offset.
   */
  offset?: number;

  /**
   * Number of lines before and after each match.
   */
  context_lines?: number;
};

/**
 * Input of an `edit_file` call.
 */
export type FxEditFileInput = {
  /**
   * File path relative to the workspace root, or an external path.
   */
  path: string;

  /**
   * Exact text to replace, which must occur exactly once.
   */
  old_string: string;

  /**
   * Replacement text.
   */
  new_string: string;
};

/**
 * Input of a `write_file` call.
 */
export type FxWriteFileInput = {
  /**
   * File path relative to the workspace root, or an external path.
   */
  path: string;

  /**
   * Complete file contents.
   */
  content: string;
};

/**
 * Input of a `shell` call.
 */
export type FxShellInput = {
  /**
   * Action to perform.
   */
  action: 'run' | 'interact' | 'stop';

  /**
   * Shell command to run.
   */
  command?: string;

  /**
   * Working directory of the command.
   */
  cwd?: string;

  /**
   * Whether to load the user's startup files.
   */
  profile?: 'clean' | 'user';

  /**
   * Observation window in milliseconds.
   */
  yield_time_ms?: number;

  /**
   * Deadline of the command in milliseconds.
   */
  timeout_ms?: number;

  /**
   * Execution handle returned by a previous run.
   */
  session_id?: string;

  /**
   * Whether to terminate immediately.
   */
  force?: boolean;
};

/**
 * Input of a call of each of fx's kernel tools, keyed by tool name.
 */
export type FxBuiltinToolInputs = {
  /**
   * Input of `read_file`.
   */
  read_file: FxReadFileInput;

  /**
   * Input of `glob_files`.
   */
  glob_files: FxGlobFilesInput;

  /**
   * Input of `grep_files`.
   */
  grep_files: FxGrepFilesInput;

  /**
   * Input of `edit_file`.
   */
  edit_file: FxEditFileInput;

  /**
   * Input of `write_file`.
   */
  write_file: FxWriteFileInput;

  /**
   * Input of `shell`.
   */
  shell: FxShellInput;
};

/**
 * Model-facing definition of one of fx's kernel tools.
 */
export type FxBuiltinToolSpec = {
  /**
   * Description shown to the model.
   */
  description: string;

  /**
   * JSON Schema of the tool's input.
   */
  inputSchema: JSONSchema7;
};

/*
 * fx's `path` field descriptions, shared by several tools. Copied from the
 * `read_file`, `write_file` and `edit_file` specs (FILE) and the `glob_files`
 * and `grep_files` specs (SEARCH_ROOT) in
 * https://github.com/vercel-labs/fx/blob/v0.0.16/src/builtins/tools.zig
 */
const FILE_PATH_DESCRIPTION =
  'File path relative to the workspace root, or an external path using an absolute path, ~/..., or a relative workspace escape such as ../...; external access is subject to permission policy.';
const SEARCH_ROOT_DESCRIPTION =
  'Optional search root relative to the workspace root, or an external path using an absolute path, ~/..., or a relative workspace escape such as ../...; external access is subject to permission policy. Omit this field to use the current directory; never send an empty string. Narrow it when possible.';

/*
 * Mirrors `read_file_description` and the `read_file` spec:
 * https://github.com/vercel-labs/fx/blob/v0.0.16/src/builtins/tools.zig#L43
 * https://github.com/vercel-labs/fx/blob/v0.0.16/src/builtins/tools.zig#L223
 */
const READ_FILE_SPEC: FxBuiltinToolSpec = {
  description:
    'Read one file with bounded line-numbered output and optional start_line/line_count range. UTF-8 text returns as numbered lines; image files (PNG, JPEG, GIF, WebP up to 3.9MB) attach to the result so you can see them. Paths may be workspace-relative or external using an absolute path, ~/..., or a relative workspace escape such as ../...; external access is subject to permission policy. When to use: inspect an exact known path before editing or explaining code, or view an image file. When NOT to use: list directories, search many files, read non-image binary data, or bypass dedicated search tools.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: FILE_PATH_DESCRIPTION },
      start_line: {
        type: 'integer',
        description: 'Optional 1-based first line to return. Defaults to 1.',
      },
      line_count: {
        type: 'integer',
        description:
          'Optional positive number of lines to return. Defaults to the normal read cap and is bounded.',
      },
    },
    required: ['path'],
  },
};

/*
 * Mirrors `glob_files_description` and the `glob_files` spec:
 * https://github.com/vercel-labs/fx/blob/v0.0.16/src/builtins/tools.zig#L39
 * https://github.com/vercel-labs/fx/blob/v0.0.16/src/builtins/tools.zig#L158
 */
const GLOB_FILES_SPEC: FxBuiltinToolSpec = {
  description:
    'Find file paths matching a glob pattern, with mode=count for exact path counts without listing entries. Paths may be workspace-relative or external using an absolute path, ~/..., or a relative workspace escape such as ../...; external access is subject to permission policy. When to use: locate files by name, extension, or directory pattern; narrow path or pattern if candidate caps appear. When NOT to use: search file contents, read files, run find, or count non-file concepts.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern to match, such as src/**/*.zig or *.md.',
      },
      path: {
        type: 'string',
        minLength: 1,
        description: SEARCH_ROOT_DESCRIPTION,
      },
      mode: {
        type: 'string',
        enum: ['matches', 'count'],
        description:
          'Use matches to return sample paths, or count to return an exact matching path count without listing entries.',
      },
    },
    required: ['pattern'],
  },
};

/*
 * Mirrors `grep_files_description` and the `grep_files` spec:
 * https://github.com/vercel-labs/fx/blob/v0.0.16/src/builtins/tools.zig#L41
 * https://github.com/vercel-labs/fx/blob/v0.0.16/src/builtins/tools.zig#L188
 */
const GREP_FILES_SPEC: FxBuiltinToolSpec = {
  description:
    'Search text files for a literal substring, optionally narrowed by path/include, with output modes for matching lines, files-with-matches, or counts plus head_limit/offset pagination and bounded context_lines for matches mode. Paths may be workspace-relative or external using an absolute path, ~/..., or a relative workspace escape such as ../...; external access is subject to permission policy. Use include as the type/path filter, such as *.zig. When to use: find exact symbols, strings, TODOs, or usage sites. When NOT to use: regex is not supported; avoid unknown-concept exploration, filename lookup, known-path reads, and shell grep; do not repeat the same or equivalent search after a caller search only finds a definition.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Literal plain-text pattern to search for.',
      },
      path: {
        type: 'string',
        minLength: 1,
        description: SEARCH_ROOT_DESCRIPTION,
      },
      include: {
        type: 'string',
        description:
          'Optional glob pattern applied to candidate file paths before reading files, such as *.zig or src/**/*.ts.',
      },
      case_insensitive: {
        type: 'boolean',
        description: 'Search case-insensitively when true.',
      },
      mode: {
        type: 'string',
        enum: ['matches', 'files_with_matches', 'count'],
        description:
          'Use matches for line matches, files_with_matches for unique matching paths, or count for exact matching-line and matching-file counts.',
      },
      head_limit: {
        type: 'integer',
        description:
          'Optional positive maximum results to return for matches or files_with_matches. Defaults to the normal output cap.',
      },
      offset: {
        type: 'integer',
        description:
          'Optional zero-based result offset for matches or files_with_matches pagination. Defaults to 0.',
      },
      context_lines: {
        type: 'integer',
        description:
          'Optional non-negative number of lines before and after each emitted match in matches mode. Bounded by the tool.',
      },
    },
    required: ['pattern'],
  },
};

/*
 * Mirrors `edit_file_description` and the `edit_file` spec:
 * https://github.com/vercel-labs/fx/blob/v0.0.16/src/builtins/tools.zig#L47
 * https://github.com/vercel-labs/fx/blob/v0.0.16/src/builtins/tools.zig#L283
 */
const EDIT_FILE_SPEC: FxBuiltinToolSpec = {
  description:
    'Edit an existing file by replacing one exact old_string occurrence with new_string. Paths may be workspace-relative or external using an absolute path, ~/..., or a relative workspace escape such as ../...; external access is subject to permission policy. When to use: make a focused patch after reading the file. When NOT to use: broad rewrites, ambiguous repeated text, generated formatting, missing files, or cross-file refactors.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: FILE_PATH_DESCRIPTION },
      old_string: {
        type: 'string',
        description: 'Exact text to find in the file. Must match exactly once.',
      },
      new_string: {
        type: 'string',
        description: 'Text to replace old_string with.',
      },
    },
    required: ['path', 'old_string', 'new_string'],
  },
};

/*
 * Mirrors `write_file_description` and the `write_file` spec:
 * https://github.com/vercel-labs/fx/blob/v0.0.16/src/builtins/tools.zig#L45
 * https://github.com/vercel-labs/fx/blob/v0.0.16/src/builtins/tools.zig#L253
 */
const WRITE_FILE_SPEC: FxBuiltinToolSpec = {
  description:
    'Create or overwrite a file using complete contents. Paths may be workspace-relative or external using an absolute path, ~/..., or a relative workspace escape such as ../...; external access is subject to permission policy. When to use: add a new file or intentionally replace an entire generated/small file. When NOT to use: targeted edits to existing files, partial replacements, deleting files, or unapproved external paths.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: FILE_PATH_DESCRIPTION },
      content: {
        type: 'string',
        description: 'Complete file contents to write.',
      },
    },
    required: ['path', 'content'],
  },
};

/*
 * The shell tool's description, from `shell_description` at
 * https://github.com/vercel-labs/fx/blob/v0.0.16/src/builtins/tools.zig#L66
 * with the Linux variant of `detach_command` (L56). The original reads:
 *
 *   Run every command with shell.run. Fast commands complete in one call;
 *   commands still running after yield_time_ms return one owned session_id
 *   and remain available across turns. Use shell.interact with that exact
 *   session_id: omit chars to observe, or provide chars to send exact input
 *   and then observe. Use shell.stop only when termination is requested.
 *   output_delta is always terminal-safe; unsafe bytes are escaped while
 *   full_output_handle retains exact output, so do not run a separate
 *   command merely to test output safety or shell usability. Owned sessions
 *   end when fx exits; & and nohup jobs end with their command. To keep a
 *   service running, use `setsid <cmd> >log 2>&1 &` and check it is ready in
 *   that call. Each call starts a new shell with the user's startup files:
 *   aliases, functions, and PATH work, but cd, export, and alias changes do
 *   not carry over. In zsh, quote glob patterns meant for another program
 *   (for example '--include=*.zig') because unmatched globs are errors.
 *
 * Parts of it describe fx's own process manager and shell setup, which this
 * adapter does not have: commands run in the session's sandbox instead. The
 * description below keeps every sentence that stays accurate verbatim, and
 * the comments in it explain each part that differs and why.
 */
const FX_SHELL_DESCRIPTION = [
  'Run every command with shell.run.',
  /*
   * Replaces "Fast commands complete in one call; ..." through "... Use
   * shell.stop only when termination is requested." This adapter has no
   * process manager that keeps a command running after its call: every run
   * call waits until the command exits or its timeout elapses, and interact
   * and stop find no session to act on.
   */
  'Every command completes in its run call: it runs until it exits or its timeout_ms elapses, so there is no owned session_id to use with shell.interact or shell.stop.',
  'output_delta is always terminal-safe; unsafe bytes are escaped while full_output_handle retains exact output, so do not run a separate command merely to test output safety or shell usability.',
  /*
   * Removes "Owned sessions end when fx exits; & and nohup jobs end with
   * their command. To keep a service running, use `setsid ...` and check it
   * is ready in that call." Whether a background process outlives its call
   * depends on the sandbox provider, not on this adapter, so neither promise
   * can be made here.
   */
  /*
   * Replaces "Each call starts a new shell with the user's startup files:
   * aliases, functions, and PATH work, but ...". Sandbox sessions run each
   * command in a non-login, non-interactive shell (`bash -c`), which reads
   * no startup files, and the profile field cannot change that.
   */
  "Each call starts a new shell without the user's startup files; cd, export, and alias changes do not carry over.",
  "In zsh, quote glob patterns meant for another program (for example '--include=*.zig') because unmatched globs are errors.",
].join(' ');

/*
 * Mirrors the `shell` spec with fx's process-only schema, which drops the tty
 * fields (`shell_process_only`, built from `shell_process_properties`):
 * https://github.com/vercel-labs/fx/blob/v0.0.16/src/builtins/tools.zig#L84
 * https://github.com/vercel-labs/fx/blob/v0.0.16/src/builtins/tools.zig#L100
 * https://github.com/vercel-labs/fx/blob/v0.0.16/src/builtins/tools.zig#L427
 */
const SHELL_SPEC: FxBuiltinToolSpec = {
  description: FX_SHELL_DESCRIPTION,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['run', 'interact', 'stop'],
        description:
          'run starts a command; interact checks on session_id; stop ends session_id. The shell command itself goes in command. Send only the fields marked for the chosen action.',
      },
      command: {
        type: 'string',
        maxLength: 65536,
        description: 'run: shell command to execute exactly once.',
      },
      cwd: {
        type: 'string',
        description: 'run: working directory; defaults to the workspace.',
      },
      profile: {
        type: 'string',
        enum: ['clean', 'user'],
        description:
          'run: defaults to user; clean skips user startup files. Mutually exclusive with shell.',
      },
      yield_time_ms: {
        type: 'integer',
        minimum: 0,
        maximum: 300000,
        description:
          'run: initial observation window of 0-30000 ms, defaults to 30000; use 0 to return the owned running handle immediately. interact: wait before yielding output, defaults to 5000. Empty observations wait 5000-300000 ms; shorter values are raised to 5000. If the process remains running, interact with the same session_id again; never rerun it.',
      },
      timeout_ms: {
        type: 'integer',
        minimum: 1,
        description:
          'run: set only when the user explicitly requests a finite deadline. Omit for commands intended to remain running, receive input, continue across turns, or be stopped later.',
      },
      session_id: {
        type: 'string',
        description:
          'interact and stop: owned execution handle returned by run.',
      },
      force: {
        type: 'boolean',
        description:
          'stop: use immediate force termination when true. Defaults to false.',
      },
    },
    additionalProperties: false,
    required: ['action'],
  },
};

/**
 * fx's kernel tools, keyed by name, in fx's advertisement order
 * (`advertisement_order` in fx's `tools.zig`).
 */
export const FX_BUILTIN_TOOL_SPECS: {
  readonly [NAME in FxBuiltinToolName]: FxBuiltinToolSpec;
} = {
  read_file: READ_FILE_SPEC,
  glob_files: GLOB_FILES_SPEC,
  grep_files: GREP_FILES_SPEC,
  edit_file: EDIT_FILE_SPEC,
  write_file: WRITE_FILE_SPEC,
  shell: SHELL_SPEC,
};
