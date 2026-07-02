/** Strips everything except digits. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Formats a CPF (11 digits) or CNPJ (14 digits) as the user types.
 * Anything longer than 11 digits is treated as a CNPJ in progress.
 */
export function formatDocument(value: string): string {
  const digits = onlyDigits(value).slice(0, 14);

  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }

  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

/** A valid CPF has 11 digits, a valid CNPJ has 14. */
export function isValidDocumentLength(value: string): boolean {
  const digits = onlyDigits(value);
  return digits.length === 11 || digits.length === 14;
}

export function documentKind(value: string): 'CPF' | 'CNPJ' | null {
  const digits = onlyDigits(value);
  if (digits.length === 11) return 'CPF';
  if (digits.length === 14) return 'CNPJ';
  return null;
}
