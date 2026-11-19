import type { JSONValue } from '@ai-sdk/provider';
import { secureJsonParse } from '@ai-sdk/provider-utils';

/**
 * Returns whether the harness can read text back with the secure parser that
 * the log replay and the stream reader use.
 */
function isReadableRecordText(options: {
  /**
   * Serialized record envelope.
   */
  text: string;
}): boolean {
  try {
    secureJsonParse(options.text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns whether text can contain a key that the secure parser inspects.
 *
 * A dangerous key appears verbatim in the text because `JSON.stringify` only
 * escapes quotes inside string values, and it never escapes the ASCII letters
 * and underscores of these names. A quoted name inside a string value is
 * preceded by a backslash, so it does not match. Skipping the full parse
 * otherwise keeps every log write and stream part from parsing its own record
 * again.
 */
function mayContainSensitiveKey(options: {
  /**
   * Serialized record envelope.
   */
  text: string;
}): boolean {
  return (
    options.text.includes('"__proto__"') ||
    options.text.includes('"constructor"')
  );
}

/**
 * Serializes one durable record envelope, such as a log event or a stream
 * record, to the text the harness stores in the World.
 *
 * Durable records are read back with the secure parser, which throws on an own
 * `__proto__` key and on an own `constructor` key whose value has an own
 * `prototype` key. Those keys are valid data, e.g. in JSON returned by a host
 * tool, and the serializable-value codec preserves them deliberately. A record
 * that stored them verbatim would therefore be committed to the World but be
 * unreadable on every later read and replay, permanently breaking the session.
 *
 * The envelope is stored verbatim when the secure parser accepts it. Otherwise
 * the value under `field` is stored as a JSON string: the sensitive keys then
 * only appear inside a string literal, which the secure parser does not
 * inspect, and `decodeJSONRecordValue()` turns the field back into a value when
 * the record is read. The encoded record still contains the value losslessly.
 *
 * The fallback text must itself be readable. If it is not, the write is refused
 * before anything is committed, so an unreadable record can never poison the
 * durable state.
 */
export function encodeJSONRecord(options: {
  /**
   * Envelope fields, including the encoded value under `field`.
   */
  record: Record<string, JSONValue>;

  /**
   * Envelope field whose value may contain prototype-sensitive keys.
   */
  field: string;
}): string {
  const text = JSON.stringify(options.record);
  if (!mayContainSensitiveKey({ text }) || isReadableRecordText({ text })) {
    return text;
  }

  const escapedRecord: Record<string, JSONValue> = Object.assign(
    Object.create(null),
    options.record,
    { [options.field]: JSON.stringify(options.record[options.field]) },
  );
  const escaped = JSON.stringify(escapedRecord);
  /*
   * With today's envelopes this cannot fail, because escaping leaves only
   * strings and numbers at the top level. The check stays as a fail-stop in
   * case an envelope shape changes, so nothing unreadable is ever committed.
   */
  if (!isReadableRecordText({ text: escaped })) {
    throw new Error('HarnessAgent: durable record cannot be stored.');
  }
  return escaped;
}

/**
 * Returns the value of an envelope field parsed from a stored record.
 *
 * A string field was stored by `encodeJSONRecord()` because the envelope as a
 * whole was not readable by the secure parser; `JSON.parse` is safe here
 * because the text was produced by `JSON.stringify` in this package, and the
 * parsed value is only cloned by the serializable-value decoder, which copies
 * own keys with `Object.defineProperty` and never assigns them.
 */
export function decodeJSONRecordValue(options: {
  /**
   * Field parsed from a stored record envelope.
   */
  value: JSONValue;
}): JSONValue {
  const { value } = options;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as JSONValue;
  } catch {
    throw new Error('HarnessAgent: stored record cannot be decoded.');
  }
}
