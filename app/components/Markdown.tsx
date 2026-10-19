import type React from 'react'

/** Renders `**bold**` spans within a single line of text. */
function renderInline(text: string, keyPrefix: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>
      : part
  )
}

/** Very basic Markdown: bold spans, `*`/`-` bullet lists, and paragraphs. */
export function renderMarkdown(text: string): React.ReactNode[] {
  const blocks: React.ReactNode[] = []
  let listItems: string[] = []

  const flushList = () => {
    if (!listItems.length) return
    blocks.push(
      <ul key={`ul-${blocks.length}`} style={{ margin: '4px 0', paddingLeft: '20px' }}>
        {listItems.map((item, i) => <li key={i}>{renderInline(item, `li-${blocks.length}-${i}`)}</li>)}
      </ul>
    )
    listItems = []
  }

  for (const line of text.split('\n')) {
    const bullet = line.match(/^\s*[*-]\s+(.*)/)
    if (bullet) {
      listItems.push(bullet[1])
      continue
    }
    flushList()
    if (line.trim() === '') {
      blocks.push(<div key={`sp-${blocks.length}`} style={{ height: '8px' }} />)
    } else {
      blocks.push(<div key={`p-${blocks.length}`}>{renderInline(line, `p-${blocks.length}`)}</div>)
    }
  }
  flushList()
  return blocks
}
