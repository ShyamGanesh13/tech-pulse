'use client'

import { useRef, useState } from 'react'
import type React from 'react'

/** Inline: `**bold**`, `` `code` `` chips, and `[text](url)` links. */
function renderInline(text: string, keyPrefix: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g)
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={key}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={key} style={inlineCode}>{part.slice(1, -1)}</code>
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) {
      return (
        <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
          {link[1]}
        </a>
      )
    }
    return part
  })
}

/** Fenced code block with a best-effort Copy button (selection fallback). */
function CodeBlock({ code, blockKey }: { code: string; blockKey: string }) {
  const preRef = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard denied/unavailable — select the code so the user can copy manually.
      const el = preRef.current?.querySelector('code')
      if (el) {
        const range = document.createRange()
        range.selectNodeContents(el)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
      }
    }
  }

  return (
    <div key={blockKey} style={{ position: 'relative', margin: '8px 0' }}>
      <button
        onClick={copy}
        title="Copy code"
        style={{
          position: 'absolute', top: '6px', right: '6px', zIndex: 1,
          background: 'var(--surface-1)', border: '1px solid var(--hair)', borderRadius: '6px',
          padding: '2px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--text-3)',
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre
        ref={preRef}
        style={{
          margin: 0, padding: '12px 14px', background: 'var(--surface-1)',
          border: '1px solid var(--hair)', borderRadius: '10px', overflowX: 'auto',
          maxWidth: '100%', fontSize: '12.5px', lineHeight: 1.55, color: 'var(--text-1)',
        }}
      >
        <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', whiteSpace: 'pre' }}>{code}</code>
      </pre>
    </div>
  )
}

const HEADING_SIZE = ['17px', '15.5px', '14.5px'] // #, ##, ###

/**
 * Lightweight Markdown: headings, fenced + inline code, bold, bullet/numbered
 * lists, links, paragraphs. Streaming-safe — an unterminated trailing ``` fence
 * renders as a code block in progress and closes once a later token arrives.
 */
export function renderMarkdown(text: string): React.ReactNode[] {
  const blocks: React.ReactNode[] = []
  let listItems: string[] = []
  let listOrdered = false
  let inCode = false
  let codeLines: string[] = []

  const flushList = () => {
    if (!listItems.length) return
    const items = listItems
    const key = `list-${blocks.length}`
    const children = items.map((item, i) => <li key={i}>{renderInline(item, `${key}-${i}`)}</li>)
    blocks.push(
      listOrdered
        ? <ol key={key} style={{ margin: '4px 0', paddingLeft: '22px' }}>{children}</ol>
        : <ul key={key} style={{ margin: '4px 0', paddingLeft: '20px' }}>{children}</ul>
    )
    listItems = []
  }

  const flushCode = () => {
    blocks.push(<CodeBlock key={`code-${blocks.length}`} blockKey={`code-${blocks.length}`} code={codeLines.join('\n')} />)
    codeLines = []
    inCode = false
  }

  for (const line of text.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      if (inCode) { flushCode() } else { flushList(); inCode = true } // opening ``` (lang after it ignored)
      continue
    }
    if (inCode) { codeLines.push(line); continue }

    const heading = line.match(/^(#{1,3})\s+(.*)/)
    if (heading) {
      flushList()
      const level = heading[1].length
      blocks.push(
        <div key={`h-${blocks.length}`} style={{ fontSize: HEADING_SIZE[level - 1], fontWeight: 700, color: 'var(--text-1)', margin: '10px 0 4px', lineHeight: 1.3 }}>
          {renderInline(heading[2], `h-${blocks.length}`)}
        </div>
      )
      continue
    }

    const numbered = line.match(/^\s*\d+\.\s+(.*)/)
    if (numbered) {
      if (!listOrdered) flushList()
      listOrdered = true
      listItems.push(numbered[1])
      continue
    }

    const bullet = line.match(/^\s*[*-]\s+(.*)/)
    if (bullet) {
      if (listOrdered) flushList()
      listOrdered = false
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
  if (inCode) flushCode() // streaming: render an unterminated fence as code-in-progress
  return blocks
}

const inlineCode: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '0.88em', background: 'var(--surface-1)', border: '1px solid var(--hair)',
  borderRadius: '5px', padding: '1px 5px',
}
