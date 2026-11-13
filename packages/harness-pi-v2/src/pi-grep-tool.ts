import { shellQuote } from '@ai-sdk/harness/utils';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import {
  createGrepTool,
  DEFAULT_MAX_BYTES,
  formatSize,
  truncateHead,
  truncateLine,
  type GrepToolDetails,
  type GrepToolInput,
} from '@earendil-works/pi-coding-agent';
import path from 'node:path';

const DEFAULT_LIMIT = 100;
const GREP_MAX_LINE_LENGTH = 500;
const EXCLUDED_DIRECTORIES = ['.git', 'node_modules'];

/**
 * One matching line found by the sandbox search.
 */
type GrepMatch = {
  /**
   * Path of the file, relative to the searched directory.
   */
  relativePath: string;

  /**
   * One-based number of the matching line.
   */
  lineNumber: number;

  /**
   * Text of the matching line.
   */
  lineText: string;
};

/**
 * Parses the output lines of `grep -n`: `path:line:text` for a recursive
 * search and `line:text` for a single file. Lines that are no matches (e.g.
 * `Binary file ... matches`) are skipped.
 */
function parseGrepOutput(options: {
  /**
   * Standard output of the search.
   */
  output: string;

  /**
   * Path to report for a single-file search, which prints no file names.
   */
  singleFile?: string;
}): GrepMatch[] {
  const matches: GrepMatch[] = [];
  for (const line of options.output.split('\n')) {
    if (options.singleFile != null) {
      const match = /^(\d+):(.*)$/s.exec(line);
      if (match == null) continue;
      matches.push({
        relativePath: options.singleFile,
        lineNumber: Number.parseInt(match[1], 10),
        lineText: match[2],
      });
      continue;
    }
    const match = /^(.+?):(\d+):(.*)$/s.exec(line);
    if (match == null) continue;
    matches.push({
      relativePath: match[1].replace(/^\.\//, ''),
      lineNumber: Number.parseInt(match[2], 10),
      lineText: match[3],
    });
  }
  return matches;
}

/**
 * Searches the sandbox like Pi's grep tool searches the local file system.
 */
async function executeGrep(options: {
  /**
   * Sandbox session to search.
   */
  session: SandboxSession;

  /**
   * Working directory that relative paths resolve against.
   */
  workDir: string;

  /**
   * Tool input given by the model.
   */
  input: GrepToolInput;

  /**
   * Aborts the search.
   */
  abortSignal?: AbortSignal;
}): Promise<AgentToolResult<GrepToolDetails | undefined>> {
  const { session, workDir, input, abortSignal } = options;
  if (abortSignal?.aborted) throw new Error('Operation aborted');

  const searchPath = path.posix.resolve(workDir, input.path || '.');
  const stat = await session.stat({ path: searchPath, abortSignal });
  if (stat == null) throw new Error(`Path not found: ${searchPath}`);
  const isDirectory = stat.type === 'directory';
  const directory = isDirectory ? searchPath : path.posix.dirname(searchPath);
  const fileName = path.posix.basename(searchPath);
  const contextValue = input.context && input.context > 0 ? input.context : 0;
  const limit = Math.max(1, input.limit ?? DEFAULT_LIMIT);

  const flags = [
    '-n',
    ...(isDirectory
      ? [
          '-r',
          ...EXCLUDED_DIRECTORIES.map(name => `--exclude-dir=${name}`),
          ...(input.glob
            ? [`--include=${path.posix.basename(input.glob)}`]
            : []),
        ]
      : []),
    ...(input.ignoreCase ? ['-i'] : []),
    input.literal ? '-F' : '-E',
  ];
  const target = isDirectory ? '.' : `./${fileName}`;
  let result: { exitCode: number; stdout: string; stderr: string };
  try {
    result = await session.run({
      command: `set -o pipefail; cd ${shellQuote(directory)} && grep ${flags.map(shellQuote).join(' ')} -e ${shellQuote(input.pattern)} ${shellQuote(target)} | head -n ${limit}`,
      abortSignal,
    });
  } catch (error) {
    if (abortSignal?.aborted) throw new Error('Operation aborted');
    throw error;
  }
  if (abortSignal?.aborted) throw new Error('Operation aborted');

  const matches = parseGrepOutput({
    output: result.stdout,
    singleFile: isDirectory ? undefined : fileName,
  }).slice(0, limit);
  /*
   * grep exits with 1 when nothing matched, and with 141 when `head` closed
   * the pipe after reaching the limit. A recursive search that hit an
   * unreadable entry exits with 2 but still reports the readable matches.
   */
  if (
    result.exitCode !== 0 &&
    result.exitCode !== 1 &&
    result.exitCode !== 141 &&
    matches.length === 0
  ) {
    throw new Error(
      result.stderr.trim() || `grep exited with code ${result.exitCode}`,
    );
  }
  if (matches.length === 0) {
    return {
      content: [{ type: 'text', text: 'No matches found' }],
      details: undefined,
    };
  }

  let linesTruncated = false;
  const formatLine = (text: string) => {
    const truncated = truncateLine(
      text.replace(/\r\n/g, '\n').replace(/\r/g, '').replace(/\n$/, ''),
      GREP_MAX_LINE_LENGTH,
    );
    if (truncated.wasTruncated) linesTruncated = true;
    return truncated.text;
  };
  const fileLines = new Map<string, string[]>();
  const getFileLines = async (relativePath: string): Promise<string[]> => {
    let lines = fileLines.get(relativePath);
    if (lines == null) {
      const content = await session.readTextFile({
        path: path.posix.join(directory, relativePath),
        abortSignal,
      });
      lines = content == null ? [] : content.replace(/\r\n/g, '\n').split('\n');
      fileLines.set(relativePath, lines);
    }
    return lines;
  };

  const outputLines: string[] = [];
  for (const match of matches) {
    if (contextValue === 0) {
      outputLines.push(
        `${match.relativePath}:${match.lineNumber}: ${formatLine(match.lineText)}`,
      );
      continue;
    }
    const lines = await getFileLines(match.relativePath);
    if (lines.length === 0) {
      outputLines.push(
        `${match.relativePath}:${match.lineNumber}: (unable to read file)`,
      );
      continue;
    }
    const start = Math.max(1, match.lineNumber - contextValue);
    const end = Math.min(lines.length, match.lineNumber + contextValue);
    for (let current = start; current <= end; current++) {
      const text = formatLine(lines[current - 1] ?? '');
      outputLines.push(
        current === match.lineNumber
          ? `${match.relativePath}:${current}: ${text}`
          : `${match.relativePath}-${current}- ${text}`,
      );
    }
  }

  const truncation = truncateHead(outputLines.join('\n'), {
    maxLines: Number.MAX_SAFE_INTEGER,
  });
  let output = truncation.content;
  const details: GrepToolDetails = {};
  const notices: string[] = [];
  if (matches.length >= limit) {
    notices.push(
      `${limit} matches limit reached. Use limit=${limit * 2} for more, or refine pattern`,
    );
    details.matchLimitReached = limit;
  }
  if (truncation.truncated) {
    notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
    details.truncation = truncation;
  }
  if (linesTruncated) {
    notices.push(
      `Some lines truncated to ${GREP_MAX_LINE_LENGTH} chars. Use read tool to see full lines`,
    );
    details.linesTruncated = true;
  }
  if (notices.length > 0) output += `\n\n[${notices.join('. ')}]`;

  return {
    content: [{ type: 'text', text: output }],
    details: Object.keys(details).length > 0 ? details : undefined,
  };
}

/**
 * Creates Pi's grep tool, searching a sandbox.
 *
 * The tool is Pi's own grep tool, but since Pi's implementation runs ripgrep
 * on the local file system, its execution runs `grep` in the sandbox
 * instead: recursively for a directory (skipping `.git` and `node_modules`),
 * as an extended regular expression or a literal string, and limited to `limit` matches (100 by default). `glob`
 * filters file names. Matches are formatted like Pi's (`path:line: text`,
 * with `path-line- text` context lines read from the file), long lines are
 * truncated, the output is cut at Pi's byte limit, and Pi's notices are
 * appended when a limit was reached.
 *
 * Throws `Path not found` for a missing path, `Operation aborted` when the
 * signal aborts, and the search's error output when it fails.
 */
export function createPiGrepTool(options: {
  /**
   * Sandbox session to search.
   */
  session: SandboxSession;

  /**
   * Working directory that relative paths resolve against.
   */
  workDir: string;
}): ReturnType<typeof createGrepTool> {
  const { session, workDir } = options;
  return {
    ...createGrepTool(workDir),
    execute: (_toolCallId, input, abortSignal) =>
      executeGrep({ session, workDir, input, abortSignal }),
  };
}
