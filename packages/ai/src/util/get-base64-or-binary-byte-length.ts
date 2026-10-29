/**
 * Returns the decoded byte length of base64 or binary data without decoding it.
 */
export function getBase64OrBinaryByteLength(data: string | Uint8Array): number {
  if (data instanceof Uint8Array) {
    return data.byteLength;
  }

  let characterCount = 0;
  let lastCharacter = '';
  let secondLastCharacter = '';
  for (const character of data) {
    if (/\s/.test(character)) {
      continue;
    }
    characterCount++;
    secondLastCharacter = lastCharacter;
    lastCharacter = character;
  }

  const padding =
    lastCharacter === '=' ? (secondLastCharacter === '=' ? 2 : 1) : 0;
  return Math.floor((characterCount * 3) / 4) - padding;
}
