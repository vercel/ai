import { removeTextAfterLastWhitespace } from './remove-text-after-last-whitespace';

it('should split text with a single space in the middle', () => {
  expect(removeTextAfterLastWhitespace('hello world')).toBe('hello ');
});

it('should split text with multiple spaces in the middle', () => {
  expect(removeTextAfterLastWhitespace('hello   world')).toBe('hello   ');
});

it('should split text with tabs', () => {
  expect(removeTextAfterLastWhitespace('hello\tworld')).toBe('hello\t');
});

it('should split text with newlines', () => {
  expect(removeTextAfterLastWhitespace('hello\nworld')).toBe('hello\n');
});

it('should split text with multiple whitespace characters', () => {
  expect(removeTextAfterLastWhitespace('hello \t\n world')).toBe('hello \t\n ');
});

it('should return the original text for input with no whitespace', () => {
  expect(removeTextAfterLastWhitespace('helloworld')).toBe('helloworld');
});

it('should split text starting with whitespace', () => {
  expect(removeTextAfterLastWhitespace('  hello world')).toBe('  hello ');
});

it('should split text ending with whitespace', () => {
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

it('should split text with non-breaking space', () => {
  expect(removeTextAfterLastWhitespace('hello\u00A0world')).toBe('hello\u00A0');
});

it('should split text with multiple consecutive whitespace sequences', () => {
  expect(removeTextAfterLastWhitespace('hello   world  again')).toBe(
    'hello   world  ',
  );
});

it('should split text with Unicode whitespace character', () => {
  expect(removeTextAfterLastWhitespace('hello\u2003world')).toBe('hello\u2003');
});

it('should return the original text for input with special characters but no whitespace', () => {
  expect(removeTextAfterLastWhitespace('hello-world')).toBe('hello-world');
});

it('should split text with trailing newline character', () => {
  expect(removeTextAfterLastWhitespace('hello world\n')).toBe('hello world\n');
});

it('should split text with whitespace before punctuation', () => {
  expect(removeTextAfterLastWhitespace('hello world !')).toBe('hello world ');
});

it('should split text with multiple types of whitespace at the end', () => {
  expect(removeTextAfterLastWhitespace('hello world \t\n')).toBe(
    'hello world \t\n',
  );
});

it('should return the original text for long input with no whitespace', () => {
  expect(removeTextAfterLastWhitespace('abcdefghijklmnopqrstuvwxyz')).toBe(
    'abcdefghijklmnopqrstuvwxyz',
  );
});

it('should split text with leading and trailing whitespace', () => {
  expect(removeTextAfterLastWhitespace('  hello world  ')).toBe(
    '  hello world  ',
  );
});

it('should return all whitespace characters', () => {
  expect(removeTextAfterLastWhitespace('\t \n')).toBe('\t \n');
});

it('should split text with embedded Unicode whitespace', () => {
  expect(removeTextAfterLastWhitespace('hello\u2009world')).toBe('hello\u2009');
});

it('should split text with multiple words and varied whitespace', () => {
  expect(removeTextAfterLastWhitespace('start middle    end')).toBe(
    'start middle    ',
  );
});

it('should split text with non-ASCII characters and whitespace', () => {
  expect(removeTextAfterLastWhitespace('こんにちは 世界')).toBe('こんにちは ');
});

it('should split text with whitespace at the beginning and special characters', () => {
  expect(removeTextAfterLastWhitespace('\n!@#$%^&*()')).toBe('\n');
});
