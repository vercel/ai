const lastWhitespaceRegexp = /^([\s\S]*?\s+)\S*$/;

export function removeTextAfterLastWhitespace(text: string): string {
  const match = text.match(lastWhitespaceRegexp);
  return match ? match[1] : text;
}
