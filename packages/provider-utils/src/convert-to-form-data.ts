/**
 * Converts an input object to FormData for multipart/form-data requests.
 *
 * Handles the following cases:
 * - `null` or `undefined` values are skipped
 * - Arrays with a single element are appended as a single value
 * - Arrays with multiple elements are appended with `[]` suffix (e.g., `image[]`)
 * - All other values are appended directly
 *
 * @param input - The input object to convert. Use a generic type for type validation.
 * @returns A FormData object containing the input values.
 *
 * @example
 * ```ts
 * type MyInput = {
 *   model: string;
 *   prompt: string;
 *   images: Blob[];
 * };
 *
 * const formData = convertToFormData<MyInput>({
 *   model: 'gpt-image-1',
 *   prompt: 'A cat',
 *   images: [blob1, blob2],
 * });
 * ```
 */
export function convertToFormData<T extends Record<string, unknown>>(
  input: T,
): FormData {
  const formData = new FormData();

  for (const [key, value] of Object.entries(input)) {
    if (value == null) {
      continue;
    }

    if (Array.isArray(value)) {
      if (value.length === 1) {
        formData.append(key, value[0] as string | Blob);
        continue;
      }

      for (const item of value) {
        formData.append(`${key}[]`, item as string | Blob);
      }
      continue;
    }

    formData.append(key, value as string | Blob);
  }

  return formData;
}
