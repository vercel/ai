import type { ACPModelMapping } from '../acp-v1-settings';

/**
 * Reads the model an ACP agent reports as currently selected for a session.
 *
 * `sessionState` is a raw `session/new`, `session/load`, `session/resume`,
 * `session/set_config_option`, or `session/set_model` response, or a
 * `config_option_update` session update. It is read without schema parsing
 * because some agents (GitHub Copilot, Grok Build) report the model through
 * the non-standard `models.currentModelId` field, which the ACP SDK types do
 * not include.
 */
export function resolveACPModelId({
  sessionState,
  modelMapping,
}: {
  sessionState: unknown;
  modelMapping: ACPModelMapping | undefined;
}): string | undefined {
  if (!isRecord(sessionState)) return undefined;

  const fromConfigOption = (): string | undefined => {
    const configOptions = Array.isArray(sessionState.configOptions)
      ? sessionState.configOptions.filter(isRecord)
      : [];
    const option =
      (modelMapping?.type === 'session-config-option'
        ? configOptions.find(candidate => candidate.id === modelMapping.path)
        : undefined) ??
      configOptions.find(candidate => candidate.category === 'model');
    return nonEmptyString(option?.currentValue);
  };

  const fromSessionModel = (): string | undefined =>
    isRecord(sessionState.models)
      ? nonEmptyString(sessionState.models.currentModelId)
      : undefined;

  return modelMapping?.type === 'session-model'
    ? (fromSessionModel() ?? fromConfigOption())
    : (fromConfigOption() ?? fromSessionModel());
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
