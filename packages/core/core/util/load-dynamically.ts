/**
 * Loads a module dynamically.
 *
 * This is useful for lazy loading optional peer dependencies and
 * avoids error when an unused peer dependency is not installed.
 *
 * @param module - The module to load.
 * @returns The loaded module.
 */
export async function loadDynamically(module: string): Promise<any> {
  try {
    // attempt ES Module loading:
    return (await import(module)).default;
  } catch (error) {
    try {
      // CommonJS Module loading:
      return require(module);
    } catch (error) {
      throw new Error(`Failed to load '${module}' module dynamically.`);
    }
  }
}
