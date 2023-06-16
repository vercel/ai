/**
 * If we're still at the start of the stream, we want to trim the leading
 * `\n\n`. But, after we've seen some text, we no longer want to trim out
 * whitespace.
 */
export function trimStartOfStreamHelper() {
  let start = true
  return (text: string) => {
    if (start) text = text.trimStart()
    if (text) start = false
    return text
  }
}
