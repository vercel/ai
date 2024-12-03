export async function loadModuleDynamically<T>({
  libraryName,
  exportName,
}: {
  libraryName: string;
  exportName: string;
}): Promise<T> {
  // Use google auth library (for Node.js).
  // Note: we try both import and require to support both ESM and CJS.
  try {
    return (await import(libraryName))[exportName];
  } catch (error) {
    try {
      return require(libraryName)[exportName];
    } catch (error) {
      throw new Error(
        `Failed to dynamically load export '${exportName}' from module '${libraryName}'.`,
      );
    }
  }
}
