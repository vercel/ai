import { getTextFromDataUrl, InvalidArgumentError } from 'ai';

try {
  getTextFromDataUrl('not-a-data-url');
} catch (error) {
  if (InvalidArgumentError.isInstance(error)) {
    console.log({
      name: error.name,
      parameter: error.parameter,
      value: error.value,
      message: error.message,
    });
  } else {
    throw error;
  }
}
