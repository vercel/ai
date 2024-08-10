import { LoadSettingError } from '@ai-sdk/provider';

type LoadSettingReturnType<T> = T extends true ? string | undefined : string;
export function loadSetting<T extends boolean = false>({
  settingValue,
  environmentVariableName,
  settingName,
  description,
  isOptional,
}: {
  settingValue: string | undefined;
  environmentVariableName: string;
  settingName: string;
  description: string;
  isOptional?: T; // Make isOptional optional and generic
}): LoadSettingReturnType<T> {
  if (typeof settingValue === 'string') {
    return settingValue;
  }

  if (settingValue != null) {
    if (isOptional) return undefined as LoadSettingReturnType<T>;
    throw new LoadSettingError({
      message: `${description} setting must be a string.`,
    });
  }

  if (typeof process === 'undefined') {
    if (isOptional) return undefined as LoadSettingReturnType<T>;
    throw new LoadSettingError({
      message: `${description} setting is missing. Pass it using the '${settingName}' parameter. Environment variables is not supported in this environment.`,
    });
  }

  settingValue = process.env[environmentVariableName];

  if (settingValue == null) {
    if (isOptional) return undefined as LoadSettingReturnType<T>;
    throw new LoadSettingError({
      message: `${description} setting is missing. Pass it using the '${settingName}' parameter or the ${environmentVariableName} environment variable.`,
    });
  }

  if (typeof settingValue !== 'string') {
    if (isOptional) return undefined as LoadSettingReturnType<T>;
    throw new LoadSettingError({
      message: `${description} setting must be a string. The value of the ${environmentVariableName} environment variable is not a string.`,
    });
  }

  return settingValue;
}
