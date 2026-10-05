import type { SettingsManager } from '@earendil-works/pi-coding-agent';

export function createPiResourceSettings(
  settingsManager: SettingsManager,
): SettingsManager {
  return new Proxy(settingsManager, {
    get(target, property) {
      if (
        property === 'getGlobalSettings' ||
        property === 'getProjectSettings'
      ) {
        return () => ({ ...target[property](), packages: [] });
      }

      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
