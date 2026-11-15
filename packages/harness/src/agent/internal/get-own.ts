export function getOwn<T extends object>(
  obj: T | undefined | null,
  key: string,
): T[keyof T] | undefined {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, key)
    ? obj[key as keyof T]
    : undefined;
}
