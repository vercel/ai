export type PartialArg = {
  jsonPath: string;
  stringValue?: string | null;
  numberValue?: number | null;
  boolValue?: boolean | null;
  nullValue?: unknown;
  willContinue?: boolean | null;
};

// added to accumulate stream delta parts for arguments of tool calls
export class GoogleJSONAccumulator {
  private accumulatedArgs: Record<string, unknown> = {};
  private jsonText = '';

  processPartialArgs(partialArgs: PartialArg[]): {
    currentJSON: Record<string, unknown>;
    textDelta: string;
  } {
    let delta = '';

    for (const arg of partialArgs) {
      const rawPath = arg.jsonPath.replace(/^\$\./, '');
      if (!rawPath) continue;

      const segments = parsePath(rawPath);
      if (segments.length === 0) continue;

      const existingValue = getNestedValue(this.accumulatedArgs, segments);
      const isStringContinuation =
        arg.stringValue != null && existingValue !== undefined;

      if (isStringContinuation) {
        const escaped = JSON.stringify(arg.stringValue).slice(1, -1);
        setNestedValue(
          this.accumulatedArgs,
          segments,
          (existingValue as string) + arg.stringValue,
        );
        this.jsonText += escaped;
        delta += escaped;
        continue;
      }

      const resolved = resolvePartialArgValue(arg);
      if (resolved == null) continue;

      setNestedValue(this.accumulatedArgs, segments, resolved.value);

      const valueJson =
        arg.stringValue != null && arg.willContinue
          ? resolved.json.slice(0, -1)
          : resolved.json;

      const prefix =
        this.jsonText === '' ? '{' : this.jsonText.endsWith('{') ? '' : ',';
      const fragment = `${prefix}${JSON.stringify(rawPath)}:${valueJson}`;
      this.jsonText += fragment;
      delta += fragment;
    }

    return {
      currentJSON: this.accumulatedArgs,
      textDelta: delta,
    };
  }

  finalize(): { finalJSON: string; closingDelta: string } {
    const finalArgs = JSON.stringify(this.accumulatedArgs);
    const closingDelta = finalArgs.slice(this.jsonText.length);
    return { finalJSON: finalArgs, closingDelta };
  }
}

function parsePath(rawPath: string): Array<string | number> {
  const segments: Array<string | number> = [];
  for (const part of rawPath.split('.')) {
    const bracketRegex = /^([^\[]*?)(\[(\d+)\])+$/;
    const match = part.match(bracketRegex);
    if (match) {
      if (match[1]) segments.push(match[1]);
      const indices = part.matchAll(/\[(\d+)\]/g);
      for (const m of indices) {
        segments.push(parseInt(m[1], 10));
      }
    } else {
      segments.push(part);
    }
  }
  return segments;
}

function getNestedValue(
  obj: Record<string, unknown>,
  segments: Array<string | number>,
): unknown {
  let current: unknown = obj;
  for (const seg of segments) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string | number, unknown>)[seg];
  }
  return current;
}

function setNestedValue(
  obj: Record<string, unknown>,
  segments: Array<string | number>,
  value: unknown,
): void {
  let current: Record<string | number, unknown> = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const nextSeg = segments[i + 1];
    if (current[seg] == null) {
      current[seg] = typeof nextSeg === 'number' ? [] : {};
    }
    current = current[seg] as Record<string | number, unknown>;
  }
  current[segments[segments.length - 1]] = value;
}

function resolvePartialArgValue(arg: {
  stringValue?: string | null;
  numberValue?: number | null;
  boolValue?: boolean | null;
  nullValue?: unknown;
}): { value: unknown; json: string } | undefined {
  if (arg.stringValue != null)
    return { value: arg.stringValue, json: JSON.stringify(arg.stringValue) };
  if (arg.numberValue != null)
    return { value: arg.numberValue, json: JSON.stringify(arg.numberValue) };
  if (arg.boolValue != null)
    return { value: arg.boolValue, json: JSON.stringify(arg.boolValue) };
  if ('nullValue' in arg) return { value: null, json: 'null' };
  return undefined;
}
