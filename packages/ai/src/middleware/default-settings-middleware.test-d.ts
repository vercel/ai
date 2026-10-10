import { describe, it } from 'vitest';
import { defaultSettingsMiddleware } from './default-settings-middleware';

describe('defaultSettingsMiddleware', () => {
  it('accepts standardized reasoning settings', () => {
    const supportedReasoningValues = [
      'provider-default',
      'none',
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ] as const;

    for (const reasoning of supportedReasoningValues) {
      defaultSettingsMiddleware({ settings: { reasoning } });
    }
  });

  it('rejects unsupported reasoning settings', () => {
    defaultSettingsMiddleware({
      settings: {
        // @ts-expect-error unsupported reasoning setting
        reasoning: 'invalid',
      },
    });
  });
});
