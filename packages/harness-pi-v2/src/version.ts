/**
 * Version string of this package, injected at build time.
 */
declare const __PACKAGE_VERSION__: string | undefined;

/**
 * Version of this package, or `0.0.0-test` when running from source.
 */
export const VERSION: string =
  typeof __PACKAGE_VERSION__ !== 'undefined'
    ? __PACKAGE_VERSION__
    : '0.0.0-test';
