export interface BatchItem {
  id: string
  text: string
}

interface BatchOptions {
  maxParagraphs: number
  maxLength: number
}

export function batchBlocks(blocks: BatchItem[], opts: BatchOptions): BatchItem[][] {
  const batches: BatchItem[][] = []
  let current: BatchItem[] = []
  let currentLen = 0

  for (const block of blocks) {
    const blockLen = block.text.length
    const wouldExceedLen = currentLen + blockLen > opts.maxLength && current.length > 0
    const wouldExceedCount = current.length >= opts.maxParagraphs

    if (wouldExceedLen || wouldExceedCount) {
      batches.push(current)
      current = []
      currentLen = 0
    }

    current.push(block)
    currentLen += blockLen
  }

  if (current.length > 0) batches.push(current)
  return batches
}

export function renderMultiplePrompt(
  template: string,
  batch: BatchItem[],
  from: string,
  to: string
): string {
  const json = JSON.stringify(
    batch.map(b => ({ id: b.id, text: b.text })),
    null,
    2
  )
  return template
    .replace('{{from}}', from)
    .replace('{{to}}', to)
    .replace('{{json}}', json)
}

export function renderSinglePrompt(template: string, text: string, from: string, to: string): string {
  return template.replace('{{from}}', from).replace('{{to}}', to).replace('{{text}}', text)
}

export function parseMultipleResponse(raw: string): Map<string, string> {
  const result = new Map<string, string>()
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) return result

  try {
    const parsed = JSON.parse(match[0]) as Array<{ id: string; text: string }>
    for (const item of parsed) {
      if (item.id && item.text) result.set(item.id, item.text)
    }
  } catch {
    // unparseable — return empty map
  }

  return result
}
