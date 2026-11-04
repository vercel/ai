export type CodexBuiltinToolPolicy = {
  readonly disabled: {
    readonly bash: boolean;
    readonly webSearch: boolean;
    readonly apply_patch: boolean;
    readonly view_image: boolean;
  };
  readonly disableEnvironments: boolean;
  readonly denyApplyPatchWithHook: boolean;
  readonly webSearchMode: 'live' | 'disabled';
};

export function resolveCodexBuiltinToolPolicy({
  builtinToolFiltering,
  webSearch,
}: {
  builtinToolFiltering:
    | { mode: 'allow' | 'deny'; toolNames: string[] }
    | undefined;
  webSearch: boolean | undefined;
}): CodexBuiltinToolPolicy {
  const included = (toolName: string) =>
    builtinToolFiltering == null ||
    (builtinToolFiltering.mode === 'allow'
      ? builtinToolFiltering.toolNames.includes(toolName)
      : !builtinToolFiltering.toolNames.includes(toolName));
  const disabled = {
    bash: !included('bash'),
    webSearch: !included('webSearch'),
    apply_patch: !included('apply_patch'),
    view_image: !included('view_image'),
  };
  const disableEnvironments =
    disabled.bash && disabled.apply_patch && disabled.view_image;

  return {
    disabled,
    disableEnvironments,
    denyApplyPatchWithHook: disabled.apply_patch && !disableEnvironments,
    webSearchMode: webSearch && !disabled.webSearch ? 'live' : 'disabled',
  };
}
