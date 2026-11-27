/**
 * Removes the fields that relate a stream part to the step executions that
 * wrote it (`attemptId`, `commitAttemptId`, `writeId`), for tests that assert
 * on the content of the parts.
 */
export function withoutDeliveryFields<PART>(part: PART): PART {
  if (typeof part !== 'object' || part === null) return part;
  const {
    attemptId: _attemptId,
    commitAttemptId: _commitAttemptId,
    writeId: _writeId,
    ...content
  } = part as Record<string, unknown>;
  return content as PART;
}
