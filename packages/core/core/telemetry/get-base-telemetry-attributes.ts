import { Attributes, AttributeValue } from '@opentelemetry/api';
import { CallSettings } from '../prompt/call-settings';
import { LanguageModel } from '../types/language-model';
import { TelemetrySettings } from './telemetry-settings';

export function getBaseTelemetryAttributes({
  operationName,
  model,
  settings,
  telemetry,
}: {
  operationName: string;
  model: LanguageModel;
  settings: Omit<CallSettings, 'abortSignal' | 'headers'>;
  telemetry: TelemetrySettings | undefined;
}): Attributes {
  return {
    'ai.model.provider': model.provider,
    'ai.model.id': model.modelId,

    // TODO record headers

    // settings:
    ...Object.entries(settings).reduce((attributes, [key, value]) => {
      attributes[`ai.settings.${key}`] = value;
      return attributes;
    }, {} as Record<string, AttributeValue>),

    // special telemetry information
    'operation.name': operationName,
    'resource.name': telemetry?.functionId,
    'ai.telemetry.functionId': telemetry?.functionId,

    // add metadata as attributes:
    ...Object.entries(telemetry?.metadata ?? {}).reduce(
      (attributes, [key, value]) => {
        attributes[`ai.telemetry.metadata.${key}`] = value;
        return attributes;
      },
      {} as Attributes,
    ),
  };
}
