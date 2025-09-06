export function sanitizeUserAgent<T>(value: T): T {
  return replaceInObject(value, (key, val) => {
    const lowerKey = key.toLowerCase();
    if (
      (lowerKey === 'user-agent' || lowerKey.endsWith('.user-agent')) &&
      typeof val === 'string'
    ) {
      return '<UA-REDACTED>';
    }
    return val;
  });
}

function replaceInObject<T>(
  input: T,
  replacer: (key: string, val: any) => any,
): T {
  if (Array.isArray(input)) {
    return input.map(item => replaceInObject(item as any, replacer)) as any;
  }
  if (input && typeof input === 'object') {
    const out: any = Array.isArray(input) ? [] : {};
    for (const [k, v] of Object.entries(input as any)) {
      if (v && typeof v === 'object') {
        out[k] = replaceInObject(v, replacer);
      } else {
        out[k] = replacer(k, v);
      }
    }
    return out;
  }
  return input;
}
