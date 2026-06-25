/** Removes inline code ticks. */
const uncode = (s: string) => s.replaceAll('`', '')

export default uncode
