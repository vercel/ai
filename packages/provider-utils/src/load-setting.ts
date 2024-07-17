import { LoadSettingError } from '@ai-sdk/provider';

// Added an overload for the `failOnMissing` parameter to be `true` by default.
export function loadSetting({
  settingValue,
  environmentVariableName,
  settingName,
  description,
  defaultValue,
  failOnMissing,
}: {
  settingValue: string | undefined;
  environmentVariableName: string;
  settingName: string;
  description: string;
  defaultValue: string | undefined;
  failOnMissing: true;
}): string;

// Added an overload for the `failOnMissing` parameter to be `false`.
export function loadSetting({
  settingValue,
  environmentVariableName,
  settingName,
  description,
  defaultValue,
  failOnMissing,
}: {
  settingValue: string | undefined;
  environmentVariableName: string;
  settingName: string;
  description: string;
  defaultValue: string | undefined;
  failOnMissing: false;
}): string | undefined;

export function loadSetting({
  settingValue,
  environmentVariableName,
  settingName,
  description,
  defaultValue,
  failOnMissing,
}: {
  settingValue: string | undefined;
  environmentVariableName: string;
  settingName: string;
  description: string;
  defaultValue: string | undefined;
  failOnMissing: boolean;
}) {
  if (typeof settingValue === 'string') {
    return settingValue;
  }

  if (settingValue != null) {
    throw new LoadSettingError({
      message: `${description} setting must be a string.`,
    });
  }

  if (typeof process === 'undefined' && failOnMissing) {
    throw new LoadSettingError({
      message: `${description} setting is missing. Pass it using the '${settingName}' parameter. Environment variables is not supported in this environment.`,
    });
  }

  settingValue = process.env[environmentVariableName];

  if (settingValue == null && failOnMissing) {
    throw new LoadSettingError({
      message: `${description} setting is missing. Pass it using the '${settingName}' parameter or the ${environmentVariableName} environment variable.`,
    });
  }

  if (typeof settingValue !== 'string' && failOnMissing) {
    throw new LoadSettingError({
      message: `${description} setting must be a string. The value of the ${environmentVariableName} environment variable is not a string.`,
    });
  }

  return settingValue ?? defaultValue ?? undefined;
}
