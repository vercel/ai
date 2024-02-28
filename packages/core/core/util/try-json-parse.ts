export function tryParseJSON(input: string): unknown | null {
  try {
    // TODO use SecureJSON.parse
    return JSON.parse(input);
  } catch {
    // ignore parse error (incomplete JSON)
    return null;
  }
}
