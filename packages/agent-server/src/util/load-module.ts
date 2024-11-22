export async function loadModule<T>({ path }: { path: string }): Promise<T> {
  try {
    // Add timestamp to bust cache (to ensure we always get the latest version)
    const pathWithoutCaching = `${path}?update=${Date.now()}`;
    return (await import(pathWithoutCaching)).default as T;
  } catch (error) {
    throw new Error(`Failed to load module ${path}: ${error}`);
  }
}
