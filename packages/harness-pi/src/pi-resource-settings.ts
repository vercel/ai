import type {
  PackageSource,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';

function isLocalPackage(pkg: PackageSource): boolean {
  const source = typeof pkg === 'string' ? pkg : pkg.source;
  return !/^(npm|git|github|https?|ssh):/.test(source.trim());
}

export function createPiResourceSettings(
  settingsManager: SettingsManager,
): SettingsManager {
  return new Proxy(settingsManager, {
    get(target, property) {
      if (
        property === 'getGlobalSettings' ||
        property === 'getProjectSettings'
      ) {
        return () => {
          const settings = target[property]();
          return {
            ...settings,
            packages: settings.packages?.filter(isLocalPackage) ?? [],
          };
        };
      }

      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
