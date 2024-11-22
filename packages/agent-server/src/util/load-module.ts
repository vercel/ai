export async function loadModule<T>({ path }: { path: string }): Promise<T> {
  try {
    return (await import(path)).default as T;
  } catch (error) {
    throw new Error(`Failed to load module ${path}: ${error}`);
  }
}
