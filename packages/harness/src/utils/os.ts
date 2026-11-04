export function isMacOS(platform: NodeJS.Platform): boolean {
  return platform === 'darwin';
}

export function isLinux(platform: NodeJS.Platform): boolean {
  return platform === 'linux';
}

export function isWindows(platform: NodeJS.Platform): boolean {
  return platform === 'win32';
}
