export type PartialArg = {
  jsonPath: string;
  stringValue?: string | null;
  numberValue?: number | null;
  boolValue?: boolean | null;
  nullValue?: unknown;
  willContinue?: boolean | null;
};

export class GoogleStreamToolCallArguments {
  private accumulatedArgs: Record<string, unknown> = {};
  private jsonText = '';

  processPartialArgs(partialArgs: PartialArg[]): {
    currentJSON: Record<string, unknown>;
    textDelta: string;
  } {
    let delta = '';

    for (const arg of partialArgs) {
      const key = arg.jsonPath.replace(/^\$\./, '');
      if (!key) continue;

      const isStringContinuation =
        arg.stringValue != null && key in this.accumulatedArgs;

      if (isStringContinuation) {
        const escaped = JSON.stringify(arg.stringValue).slice(1, -1);
        this.accumulatedArgs[key] =
          (this.accumulatedArgs[key] as string) + arg.stringValue;
        this.jsonText += escaped;
        delta += escaped;
        continue;
      }

      const resolved = resolvePartialArgValue(arg);
      if (resolved == null) continue;

      this.accumulatedArgs[key] = resolved.value;

      const valueJson =
        arg.stringValue != null && arg.willContinue
          ? resolved.json.slice(0, -1)
          : resolved.json;

      const prefix =
        this.jsonText === '' ? '{' : this.jsonText.endsWith('{') ? '' : ',';
      const fragment = `${prefix}${JSON.stringify(key)}:${valueJson}`;
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
