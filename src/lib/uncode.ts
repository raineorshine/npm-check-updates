/** Strips markdown formatting (code ticks, italic, bold) that only makes sense in a rendered markdown context. */
const uncode = (s: string) =>
  s
    .replaceAll('`', '')
    .replaceAll(/\*\*(.+?)\*\*/g, '$1')
    .replaceAll(/_(.+?)_/g, '$1')

export default uncode
