import { splitOnLastWhitespace } from './split-on-last-whitespace';

it('should split text with a single space in the middle', () => {
  expect(splitOnLastWhitespace('hello world')).toEqual({
    prefix: 'hello',
    whitespace: ' ',
    suffix: 'world',
  });
});

it('should split text with multiple spaces in the middle', () => {
  expect(splitOnLastWhitespace('hello   world')).toEqual({
    prefix: 'hello',
    whitespace: '   ',
    suffix: 'world',
  });
});

it('should split text with tabs', () => {
  expect(splitOnLastWhitespace('hello\tworld')).toEqual({
    prefix: 'hello',
    whitespace: '\t',
    suffix: 'world',
  });
});

it('should split text with newlines', () => {
  expect(splitOnLastWhitespace('hello\nworld')).toEqual({
    prefix: 'hello',
    whitespace: '\n',
    suffix: 'world',
  });
});

it('should split text with multiple whitespace characters', () => {
  expect(splitOnLastWhitespace('hello \t\n world')).toEqual({
    prefix: 'hello',
    whitespace: ' \t\n ',
    suffix: 'world',
  });
});

it('should return undefined for text with no whitespace', () => {
  expect(splitOnLastWhitespace('helloworld')).toBeUndefined();
});

it('should split text starting with whitespace', () => {
  expect(splitOnLastWhitespace('  hello world')).toEqual({
    prefix: '  hello',
    whitespace: ' ',
    suffix: 'world',
  });
});

it('should split text ending with whitespace', () => {
  expect(splitOnLastWhitespace('hello world  ')).toEqual({
    prefix: 'hello world',
    whitespace: '  ',
    suffix: '',
  });
});

it('should split text consisting only of whitespace', () => {
  expect(splitOnLastWhitespace('    ')).toEqual({
    prefix: '',
    whitespace: '    ',
    suffix: '',
  });
});

it('should return undefined for empty string', () => {
  expect(splitOnLastWhitespace('')).toBeUndefined();
});

it('should split text with a single whitespace character', () => {
  expect(splitOnLastWhitespace(' ')).toEqual({
    prefix: '',
    whitespace: ' ',
    suffix: '',
  });
});

it('should split text with non-breaking space', () => {
  expect(splitOnLastWhitespace('hello\u00A0world')).toEqual({
    prefix: 'hello',
    whitespace: '\u00A0',
    suffix: 'world',
  });
});

it('should split text with multiple consecutive whitespace sequences', () => {
  expect(splitOnLastWhitespace('hello   world  again')).toEqual({
    prefix: 'hello   world',
    whitespace: '  ',
    suffix: 'again',
  });
});

it('should split text with Unicode whitespace character', () => {
  expect(splitOnLastWhitespace('hello\u2003world')).toEqual({
    prefix: 'hello',
    whitespace: '\u2003',
    suffix: 'world',
  });
});

it('should return undefined for text with special characters but no whitespace', () => {
  expect(splitOnLastWhitespace('hello-world')).toBeUndefined();
});

it('should split text with trailing newline character', () => {
  expect(splitOnLastWhitespace('hello world\n')).toEqual({
    prefix: 'hello world',
    whitespace: '\n',
    suffix: '',
  });
});

it('should split text with whitespace before punctuation', () => {
  expect(splitOnLastWhitespace('hello world !')).toEqual({
    prefix: 'hello world',
    whitespace: ' ',
    suffix: '!',
  });
});

it('should split text with multiple types of whitespace at the end', () => {
  expect(splitOnLastWhitespace('hello world \t\n')).toEqual({
    prefix: 'hello world',
    whitespace: ' \t\n',
    suffix: '',
  });
});

it('should return undefined for long text with no whitespace', () => {
  expect(splitOnLastWhitespace('abcdefghijklmnopqrstuvwxyz')).toBeUndefined();
});

it('should split text with leading and trailing whitespace', () => {
  expect(splitOnLastWhitespace('  hello world  ')).toEqual({
    prefix: '  hello world',
    whitespace: '  ',
    suffix: '',
  });
});

it('should split text with only whitespace characters', () => {
  expect(splitOnLastWhitespace('\t \n')).toEqual({
    prefix: '',
    whitespace: '\t \n',
    suffix: '',
  });
});

it('should split text with embedded Unicode whitespace', () => {
  expect(splitOnLastWhitespace('hello\u2009world')).toEqual({
    prefix: 'hello',
    whitespace: '\u2009',
    suffix: 'world',
  });
});

it('should split text with multiple words and varied whitespace', () => {
  expect(splitOnLastWhitespace('start middle    end')).toEqual({
    prefix: 'start middle',
    whitespace: '    ',
    suffix: 'end',
  });
});

it('should split text with non-ASCII characters and whitespace', () => {
  expect(splitOnLastWhitespace('こんにちは 世界')).toEqual({
    prefix: 'こんにちは',
    whitespace: ' ',
    suffix: '世界',
  });
});

it('should split text with whitespace at the beginning and special characters', () => {
  expect(splitOnLastWhitespace('\n!@#$%^&*()')).toEqual({
    prefix: '',
    whitespace: '\n',
    suffix: '!@#$%^&*()',
  });
});
