import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import path from 'node:path';
import { shellQuote } from './shell-quote';
import {
  WRITE_PROTECTION_SCAN_LIMIT,
  assertWriteProtectedPathEntries,
  isInsideWriteProtectionPath,
  matchesWriteProtectedPath,
} from './write-protected-path-matching';

/*
 * Shell functions shared by every write protection script. They only use
 * bash 3.2 features and options supported by GNU, BSD, and BusyBox tools, so
 * the scripts run in minimal sandboxes as well as on macOS.
 *
 * - `canonical` sets `canonical_path` to the realpath of an existing entry.
 *   The output is framed so trailing newlines in path names survive command
 *   substitution.
 * - `resolve` sets `resolved` to the canonical path of a possibly missing
 *   entry: the nearest existing ancestor is resolved and the missing segments
 *   are appended. Dangling symlinks and missing `.` or `..` segments fail.
 * - `scan` lists every entry below a directory without following symlinks,
 *   reports the canonical target of each symlink, and stops with `X` once the
 *   entry budget is exceeded. It pipes `find` into the loop inside a subshell
 *   with `pipefail`, so it needs no temporary files and still fails when
 *   `find` fails.
 *
 * Every path is emitted base64 encoded, one record per line.
 */
const WRITE_PROTECTION_SHELL_FUNCTIONS = String.raw`
frame=__AI_SDK_WRITE_PROTECTION_FRAME__
b64() { printf '%s' "$1" | base64 | tr -d '\r\n'; }
emit() {
  printf '%s' "$1"
  shift
  for emit_field in "$@"; do printf ' %s' "$emit_field"; done
  printf '\n'
}
canonical() {
  canonical_framed=$(realpath "$1" 2>/dev/null; canonical_status=$?; printf '%s' "$frame"; exit "$canonical_status") || return 1
  canonical_path=${'$'}{canonical_framed%"$frame"}
  canonical_path=${'$'}{canonical_path%$'\n'}
  case "$canonical_path" in /*) ;; *) return 1 ;; esac
}
resolve() {
  resolve_target=$1
  resolve_missing=
  while [ ! -e "$resolve_target" ] && [ ! -L "$resolve_target" ]; do
    resolve_parent=${'$'}{resolve_target%/*}
    [ -n "$resolve_parent" ] || resolve_parent=/
    resolve_segment=${'$'}{resolve_target##*/}
    if [ "$resolve_parent" = "$resolve_target" ] || [ -z "$resolve_segment" ] || [ "$resolve_segment" = . ] || [ "$resolve_segment" = .. ]; then
      return 1
    fi
    resolve_missing=/$resolve_segment$resolve_missing
    resolve_target=$resolve_parent
  done
  if [ -L "$resolve_target" ] && [ ! -e "$resolve_target" ]; then return 1; fi
  canonical "$resolve_target" || return 1
  resolved=${'$'}{canonical_path%/}$resolve_missing
  [ -n "$resolved" ] || resolved=/
}
scan() {
  (
    set -o pipefail
    find "$1" -mindepth 1 -print0 | {
      scan_count=0
      while IFS= read -r -d '' scan_entry; do
        scan_count=$((scan_count + 1))
        if [ "$scan_count" -gt "$scan_budget" ]; then
          emit X
          exit 0
        fi
        if [ -L "$scan_entry" ]; then
          if [ ! -e "$scan_entry" ] || ! canonical "$scan_entry"; then
            exit 1
          fi
          if [ -d "$canonical_path" ]; then scan_is_dir=1; else scan_is_dir=0; fi
          emit S "$scan_is_dir" "$(b64 "$canonical_path")"
        fi
      done
      emit C "$scan_count"
    }
  )
}
`;

/**
 * Returns whether writing to any of `paths` touches a write-protected path and
 * therefore requires the host's approval. Runs on the host and inspects the
 * sandbox filesystem through `sandbox.run`, with one command for the common
 * case and one more per round of symlinked directories to scan.
 *
 * `paths` must be absolute sandbox paths, already mapped the way the adapter's
 * file tools map them. `writeProtectedPaths` entries are relative to
 * `workDir` and must not contain empty, `.`, or `..` segments.
 *
 * Matching follows `isWriteProtectedPath` from `@ai-sdk/harness/bridge`: a
 * path matches when its canonical location is a protected path, lies inside
 * one, or is a parent of one. Symlinks inside protected directories protect
 * their targets, and while any protected path exists, writes to files with
 * more than one link match too. Any failure reports the write as protected.
 */
export async function isSandboxWriteProtectedPath({
  sandbox,
  workDir,
  paths,
  writeProtectedPaths,
  abortSignal,
}: {
  sandbox: Experimental_SandboxSession;
  workDir: string;
  paths: ReadonlyArray<string>;
  writeProtectedPaths: ReadonlyArray<string>;
  abortSignal?: AbortSignal;
}): Promise<boolean> {
  assertWriteProtectedPathEntries(writeProtectedPaths);
  if (paths.length === 0) return true;
  if (writeProtectedPaths.length === 0) return false;

  try {
    const targetPaths: string[] = [];
    for (const filePath of paths) {
      if (
        typeof filePath !== 'string' ||
        filePath.trim().length === 0 ||
        !path.posix.isAbsolute(filePath)
      ) {
        return true;
      }
      for (const candidatePath of new Set([
        filePath,
        path.posix.normalize(filePath),
      ])) {
        targetPaths.push(withoutTrailingSlashes(candidatePath));
      }
    }

    const initial = await runWriteProtectionScript({
      sandbox,
      abortSignal,
      script: [
        WRITE_PROTECTION_SHELL_FUNCTIONS,
        `workdir=${shellQuote(workDir)}`,
        'canonical "$workdir" || exit 3',
        'canonical_workdir=$canonical_path',
        'emit W "$(b64 "$canonical_workdir")"',
        'scan_roots=()',
        `for entry in ${writeProtectedPaths.map(shellQuote).join(' ')}; do`,
        '  resolve "$workdir/$entry" || exit 3',
        '  root_exists=0',
        '  root_is_dir=0',
        '  if [ -e "$resolved" ] || [ -L "$resolved" ]; then root_exists=1; fi',
        '  if [ "$root_exists" = 1 ] && [ -d "$resolved" ] && [ ! -L "$resolved" ]; then',
        '    root_is_dir=1',
        '    root_seen=0',
        '    for scan_root in "${scan_roots[@]}"; do [ "$scan_root" = "$resolved" ] && root_seen=1; done',
        '    [ "$root_seen" = 1 ] || scan_roots+=("$resolved")',
        '  fi',
        '  emit P "$root_exists" "$root_is_dir" "$(b64 "$resolved")"',
        'done',
        `for target in ${targetPaths.map(shellQuote).join(' ')}; do`,
        '  resolve "$target" || exit 3',
        '  target_multi_link=0',
        '  if [ -e "$resolved" ] && [ -n "$(find "$resolved" -prune -type f -links +1 -print)" ]; then target_multi_link=1; fi',
        '  emit T "$target_multi_link" "$(b64 "$resolved")"',
        'done',
        `scan_budget=${WRITE_PROTECTION_SCAN_LIMIT}`,
        'for scan_root in "${scan_roots[@]}"; do scan "$scan_root" || exit 3; done',
        'emit E',
      ].join('\n'),
    });
    if (initial == null) return true;

    const canonicalWorkDir = initial.find(record => record.type === 'W')?.path;
    const roots = initial.filter(record => record.type === 'P');
    const targets = initial.filter(record => record.type === 'T');
    if (
      canonicalWorkDir == null ||
      roots.length !== writeProtectedPaths.length ||
      targets.length !== targetPaths.length
    ) {
      return true;
    }

    const protectedPaths = [
      ...writeProtectedPaths.map(entry =>
        path.posix.join(canonicalWorkDir, entry),
      ),
      ...roots.map(record => record.path!),
    ];
    const scanned = new Set(
      roots
        .filter(record => record.flags[1] === '1')
        .map(record => record.path!),
    );
    let records = initial;
    let entryCount = 0;
    for (;;) {
      if (records.some(record => record.type === 'X')) return true;
      for (const record of records) {
        if (record.type === 'C') entryCount += Number(record.flags[0]);
      }
      if (entryCount > WRITE_PROTECTION_SCAN_LIMIT) return true;

      const queue: string[] = [];
      for (const record of records) {
        if (record.type !== 'S') continue;
        protectedPaths.push(record.path!);
        if (
          record.flags[0] === '1' &&
          !scanned.has(record.path!) &&
          isInsideWriteProtectionPath({
            parent: canonicalWorkDir,
            candidate: record.path!,
          })
        ) {
          scanned.add(record.path!);
          queue.push(record.path!);
        }
      }
      if (queue.length === 0) break;

      const next = await runWriteProtectionScript({
        sandbox,
        abortSignal,
        script: [
          WRITE_PROTECTION_SHELL_FUNCTIONS,
          `scan_budget=${WRITE_PROTECTION_SCAN_LIMIT - entryCount}`,
          `for scan_root in ${queue.map(shellQuote).join(' ')}; do scan "$scan_root" || exit 3; done`,
          'emit E',
        ].join('\n'),
      });
      if (next == null) return true;
      records = next;
    }

    return matchesWriteProtectedPath({
      targets: targets.map(record => ({
        path: record.path!,
        isMultiLinkFile: record.flags[0] === '1',
      })),
      protectedPaths,
      anyProtectedPathExists: roots.some(record => record.flags[0] === '1'),
    });
  } catch {
    return true;
  }
}

type WriteProtectionRecord = {
  type: string;
  flags: string[];
  path?: string;
};

const RECORD_PATH_FIELD_COUNT: Readonly<Record<string, number>> = {
  W: 0,
  P: 2,
  T: 1,
  S: 1,
};

async function runWriteProtectionScript({
  sandbox,
  script,
  abortSignal,
}: {
  sandbox: Experimental_SandboxSession;
  script: string;
  abortSignal: AbortSignal | undefined;
}): Promise<WriteProtectionRecord[] | undefined> {
  const result = await sandbox.run({
    command: `bash -c ${shellQuote(script)}`,
    ...(abortSignal ? { abortSignal } : {}),
  });
  if (result.exitCode !== 0) return undefined;

  const lines = result.stdout.split('\n');
  if (lines.pop() !== '' || lines.at(-1) !== 'E') return undefined;
  const records: WriteProtectionRecord[] = [];
  for (const line of lines.slice(0, -1)) {
    const [type, ...fields] = line.split(' ');
    const flagCount = RECORD_PATH_FIELD_COUNT[type!];
    if (flagCount == null) {
      if (type === 'C' && fields.length === 1 && /^\d+$/.test(fields[0]!)) {
        records.push({ type, flags: fields });
        continue;
      }
      if (type === 'X' && fields.length === 0) {
        records.push({ type, flags: [] });
        continue;
      }
      return undefined;
    }
    if (fields.length !== flagCount + 1) return undefined;
    const flags = fields.slice(0, flagCount);
    if (!flags.every(flag => flag === '0' || flag === '1')) return undefined;
    const decoded = decodeRecordPath(fields[flagCount]!);
    if (decoded == null || !path.posix.isAbsolute(decoded)) return undefined;
    records.push({ type: type!, flags, path: decoded });
  }
  return records;
}

function decodeRecordPath(encoded: string): string | undefined {
  if (
    encoded.length === 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      encoded,
    )
  ) {
    return undefined;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.from(encoded, 'base64'),
    );
  } catch {
    return undefined;
  }
}

function withoutTrailingSlashes(filePath: string): string {
  const trimmed = filePath.replace(/\/+$/, '');
  return trimmed.length === 0 ? '/' : trimmed;
}
