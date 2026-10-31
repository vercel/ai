import { InvalidArgumentError } from 'ai';
import { createDeleteFileTool } from './delete-file-tool';
import { createEditTool } from './edit-tool';
import type { FsToolSettings } from './fs-tool-settings';
import { createGlobTool } from './glob-tool';
import { createGrepTool } from './grep-tool';
import { createListTool } from './list-tool';
import { createReadTool } from './read-tool';
import { createWriteTool } from './write-tool';

function validatePositiveInteger({
  parameter,
  value,
  max = Number.MAX_SAFE_INTEGER,
}: {
  parameter: string;
  value: number;
  max?: number;
}) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new InvalidArgumentError({
      parameter,
      value,
      message: `Must be an integer between 1 and ${max}.`,
    });
  }
}

/**
 * Create provider-independent filesystem tools: `read`, `write`, `edit`,
 * `deleteFile`, `list`, `glob`, and `grep`.
 *
 * The tools operate on the sandbox passed as `experimental_sandbox` to
 * `generateText`, `streamText`, or an agent, so they can be created once and
 * used with different sandboxes. Executing a tool without a sandbox throws.
 * Expected failures, such as a missing file, are returned as results so the
 * model can recover.
 *
 * @param workingDirectory - Directory that relative paths from the model
 * resolve against, and the default directory for `list`, `glob`, and `grep`.
 * Can be absolute or relative to the sandbox's working directory. Defaults to
 * the sandbox's working directory.
 * @param maxFileSize - Maximum size in bytes of files that `read` and `edit`
 * load. Defaults to 10 MiB.
 * @param maxReadLength - Maximum characters of text `read` returns per call.
 * Longer files can be read with the `offset` input. Defaults to 50,000.
 * @param maxResults - Default maximum number of results `glob` and `grep`
 * return. Defaults to 100.
 * @param timeout - Timeout in milliseconds for each tool execution. Defaults
 * to 30,000.
 */
export function createFsTools({
  workingDirectory,
  maxFileSize = 10 * 1024 * 1024,
  maxReadLength = 50_000,
  maxResults = 100,
  timeout = 30_000,
}: {
  workingDirectory?: string;
  maxFileSize?: number;
  maxReadLength?: number;
  maxResults?: number;
  timeout?: number;
} = {}) {
  if (workingDirectory !== undefined && workingDirectory.trim() === '') {
    throw new InvalidArgumentError({
      parameter: 'workingDirectory',
      value: workingDirectory,
      message: 'Must not be empty.',
    });
  }

  validatePositiveInteger({ parameter: 'maxFileSize', value: maxFileSize });
  validatePositiveInteger({ parameter: 'maxReadLength', value: maxReadLength });
  validatePositiveInteger({ parameter: 'maxResults', value: maxResults });
  validatePositiveInteger({
    parameter: 'timeout',
    value: timeout,
    // AbortSignal.timeout overflows above 2^31 - 1 ms and fires immediately.
    max: 2_147_483_647,
  });

  const settings: FsToolSettings = {
    workingDirectory,
    maxFileSize,
    maxReadLength,
    maxResults,
    timeout,
  };

  return {
    read: createReadTool(settings),
    write: createWriteTool(settings),
    edit: createEditTool(settings),
    deleteFile: createDeleteFileTool(settings),
    list: createListTool(settings),
    glob: createGlobTool(settings),
    grep: createGrepTool(settings),
  };
}
