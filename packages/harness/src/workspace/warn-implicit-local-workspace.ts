const WARNING =
  'HarnessAgent: neither `sandbox` nor `workspace` was given, so the harness runs on the ' +
  'local machine in the current working directory, as the current user, with no isolation. ' +
  'Pass `workspace: localWorkspace({ path })` to make this explicit, or a sandbox provider ' +
  'such as `@ai-sdk/sandbox-vercel` for untrusted input or output. To silence this, set the ' +
  '`AI_SDK_LOG_WARNINGS` global to `false` or to your own logger.';

let hasWarned = false;

/**
 * Warn once per process that the implicit local workspace is in use.
 *
 * Running an agent against the user's real filesystem with no isolation is
 * worth saying out loud, but a library that prints on every session is a
 * nuisance, so this fires once. An **explicit** `workspace:` never warns —
 * the consumer already made the choice this warning exists to surface.
 *
 * Honours the same `AI_SDK_LOG_WARNINGS` switch as the rest of the AI SDK:
 * `false` silences it, a function receives it instead. `process.emitWarning`
 * is used where available so Node's own `--no-warnings` and warning
 * listeners work too.
 */
export function warnAboutImplicitLocalWorkspace(): void {
  if (hasWarned) return;
  hasWarned = true;

  const logger = globalThis.AI_SDK_LOG_WARNINGS;
  if (logger === false) return;
  if (typeof logger === 'function') {
    logger({ warnings: [{ type: 'other', message: WARNING }] });
    return;
  }

  if (
    typeof process !== 'undefined' &&
    typeof process.emitWarning === 'function'
  ) {
    process.emitWarning(WARNING, { type: 'Warning' });
  } else {
    console.warn(WARNING);
  }
}

/** Test seam: forget that the warning already fired. */
export function resetImplicitLocalWorkspaceWarning(): void {
  hasWarned = false;
}
