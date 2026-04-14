import { Attributes, AttributeValue } from '@opentelemetry/api';
import type { LanguageModelCallOptions } from 'ai';

export function getBaseTelemetryAttributes({
  model,
  settings,
  headers,
  context,
}: {
  model: { modelId: string; provider: string };
  settings: Omit<LanguageModelCallOptions, 'temperature'>;
  headers: Record<string, string | undefined> | undefined;
  context: Record<string, unknown> | undefined;
}): Attributes {
  return {
    'ai.model.provider': model.provider,
    'ai.model.id': model.modelId,

    // settings:
    ...Object.entries(settings).reduce((attributes, [key, value]) => {
      attributes[`ai.settings.${key}`] = value as AttributeValue;
      return attributes;
    }, {} as Attributes),

    // add context as attributes:
    ...Object.entries(context ?? {}).reduce((attributes, [key, value]) => {
      if (value != undefined) {
        attributes[`ai.settings.context.${key}`] = value as AttributeValue;
      }
      return attributes;
    }, {} as Attributes),

    // request headers
    ...Object.entries(headers ?? {}).reduce((attributes, [key, value]) => {
      if (value !== undefined) {
        attributes[`ai.request.headers.${key}`] = value;
      }
      return attributes;
    }, {} as Attributes),
  };
}
