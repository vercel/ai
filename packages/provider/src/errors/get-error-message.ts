export function getErrorMessage(error: unknown | undefined): string {
  if (error == null) {
    return 'unknown error';
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    if (error instanceof Error) {
      const message = error.toString();

      if (typeof message === 'string') {
        return message;
      }
    }
  } catch {
    // fall through to alternative formatting
  }

  try {
    const message = JSON.stringify(error);

    if (typeof message === 'string') {
      return message;
    }
  } catch {
    // fall through to string coercion
  }

  try {
    return String(error);
  } catch {
    return 'unknown error';
  }
}
