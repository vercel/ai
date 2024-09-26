import { removeTextAfterLastWhitespace } from './remove-text-after-last-whitespace';

it('should return text up to the last space', () => {
  expect(removeTextAfterLastWhitespace('hello world')).toBe('hello ');
});

it('should return text up to the last space, preserving multiple spaces', () => {
  expect(removeTextAfterLastWhitespace('hello   world')).toBe('hello   ');
});

it('should return text up to the last tab', () => {
  expect(removeTextAfterLastWhitespace('hello\tworld')).toBe('hello\t');
});

it('should return text up to the last newline', () => {
  expect(removeTextAfterLastWhitespace('hello\nworld')).toBe('hello\n');
});

it('should return text up to the last whitespace, preserving multiple types', () => {
  expect(removeTextAfterLastWhitespace('hello \t\n world')).toBe('hello \t\n ');
});

it('should return the original text for input with no whitespace', () => {
  expect(removeTextAfterLastWhitespace('helloworld')).toBe('helloworld');
});

it('should return text up to the last whitespace for input starting with whitespace', () => {
  expect(removeTextAfterLastWhitespace('  hello world')).toBe('  hello ');
});

it('should return the entire input for text ending with whitespace', () => {
  expect(removeTextAfterLastWhitespace('hello world  ')).toBe('hello world  ');
});

it('should return all whitespace for text consisting only of whitespace', () => {
  expect(removeTextAfterLastWhitespace('    ')).toBe('    ');
});

it('should return empty string for empty string', () => {
  expect(removeTextAfterLastWhitespace('')).toBe('');
});

it('should return a single whitespace character', () => {
  expect(removeTextAfterLastWhitespace(' ')).toBe(' ');
});

it('should return text up to the last non-breaking space', () => {
  expect(removeTextAfterLastWhitespace('hello\u00A0world')).toBe('hello\u00A0');
});

it('should return text up to the last Unicode whitespace character', () => {
  expect(removeTextAfterLastWhitespace('hello\u2003world')).toBe('hello\u2003');
});

it('should return text up to the last embedded Unicode whitespace', () => {
  expect(removeTextAfterLastWhitespace('hello\u2009world')).toBe('hello\u2009');
});

it('should return the original text for input with special characters but no whitespace', () => {
  expect(removeTextAfterLastWhitespace('hello-world')).toBe('hello-world');
});

it('should return the entire input for text with trailing newline character', () => {
  expect(removeTextAfterLastWhitespace('hello world\n')).toBe('hello world\n');
});

it('should return text up to the last whitespace before punctuation', () => {
  expect(removeTextAfterLastWhitespace('hello world !')).toBe('hello world ');
});

it('should return the entire input for text with multiple types of whitespace at the end', () => {
  expect(removeTextAfterLastWhitespace('hello world \t\n')).toBe(
    'hello world \t\n',
  );
});

it('should return the original text for long input with no whitespace', () => {
  expect(removeTextAfterLastWhitespace('abcdefghijklmnopqrstuvwxyz')).toBe(
    'abcdefghijklmnopqrstuvwxyz',
  );
});

it('should return the entire input for text with leading and trailing whitespace', () => {
  expect(removeTextAfterLastWhitespace('  hello world  ')).toBe(
    '  hello world  ',
  );
});

it('should return all whitespace characters', () => {
  expect(removeTextAfterLastWhitespace('\t \n')).toBe('\t \n');
});

it('should return text up to the last whitespace with non-ASCII characters', () => {
  expect(removeTextAfterLastWhitespace('こんにちは 世界')).toBe('こんにちは ');
});

it('should return text up to the last whitespace with leading special characters', () => {
  expect(removeTextAfterLastWhitespace('\n!@#$%^&*()')).toBe('\n');
});
