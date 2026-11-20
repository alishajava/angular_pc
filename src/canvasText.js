// Breaks `text` into lines that each fit within `maxWidth` on the given
// canvas context, splitting on spaces (Korean sentences here use spaces
// between words, so this works without a dedicated word-segmenter).
export function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ')
  const lines = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (current && ctx.measureText(test).width > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines
}
