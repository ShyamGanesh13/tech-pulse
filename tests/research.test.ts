import { describe, it, expect } from 'bun:test'
import { parseQueries, safeUrl, linkCitations, splitParts, extractText, runResearch, type Query } from '@/lib/research'

describe('research helpers', () => {
  it('parses search lines and ignores prose', () => {
    expect(parseQueries('Here is the plan:\n1. WEB: "what is mamba"\n- github: state-spaces mamba\nHF: mamba\nNOPE: x\nARXIV: selective state space')).toEqual([
      { kind: 'web', q: 'what is mamba' }, { kind: 'github', q: 'state-spaces mamba' },
      { kind: 'hf', q: 'mamba' }, { kind: 'arxiv', q: 'selective state space' },
    ])
    expect(parseQueries('DONE')).toEqual([])
  })

  it('refuses urls that point inward', () => {
    for (const bad of ['http://localhost:3000/', 'http://127.0.0.1/', 'http://2130706433/', 'http://10.1.2.3/x', 'http://169.254.169.254/latest',
      'http://192.168.1.1/', 'http://172.20.0.1/', 'http://[::1]/', 'http://intranet/', 'http://db.internal/', 'file:///etc/passwd', 'ftp://example.com/'])
      expect(safeUrl(bad)).toBeNull()
    expect(safeUrl('https://github.com/a/b')?.hostname).toBe('github.com')
  })

  it('links citations to their sources and leaves unknown numbers alone', () => {
    const src = [{ url: 'https://a.example/x' }, { url: 'https://b.example/y_(z)' }]
    expect(linkCitations('Fast [1], small [1, 2], odd [7], kept [2](u).', src))
      .toBe('Fast ([1](https://a.example/x)), small ([1](https://a.example/x), [2](https://b.example/y_%28z%29)), odd [7], kept [2](u).')
  })

  it('splits at sections, never over the limit, losing nothing', () => {
    const md = ['## A\n\n' + 'a'.repeat(300), '## B\n\n' + 'b'.repeat(300), '## C\n\n' + 'c'.repeat(400) + '\n\n' + 'd'.repeat(400)].join('\n\n')
    const parts = splitParts(md, 700)
    expect(parts.every(p => p.length <= 700)).toBe(true)
    expect(parts[0]).toBe('## A\n\n' + 'a'.repeat(300) + '\n\n## B\n\n' + 'b'.repeat(300))
    expect(parts[1]).toBe('## C\n\n' + 'c'.repeat(400))
    expect(parts.join('').replace(/\s/g, '')).toBe(md.replace(/\s/g, ''))
  })

  it('extracts article text without chrome or scripts', () => {
    const t = extractText('<html><head><title>T</title><script>x()</script></head><body><nav>menu</nav><article><h1>Head</h1><p>One.</p><p>Two.</p></article><footer>foot</footer></body></html>')
    expect(t).toBe('T\nHead\nOne.\nTwo.')
  })
})

describe('runResearch', () => {
  it('plans, reads, refines, and writes a cited report', async () => {
    const searches: Query[] = []
    const { report, sources } = await runResearch('What is Foo? https://foo.example/docs', {
      chat: async ([system, user]) => {
        if (system.content.startsWith('You plan')) return 'WEB: foo overview\nGITHUB: foo'
        if (system.content.startsWith('You are taking')) return user.content.includes('spam') ? 'IRRELEVANT' : '- Foo is a thing.'
        if (system.content.startsWith('You are reviewing')) return 'ARXIV: foo paper'
        if (system.content.startsWith('Plan a detailed')) return '1. What Foo is\n2. Limits'
        return '## Repeated heading\nFoo works [1] and scales [2, 3].'
      },
      search: async q => {
        searches.push(q)
        return [{ title: `${q.kind} hit`, url: `https://${q.kind}.example/${q.kind === 'github' ? 'spam' : 'page'}`, snippet: '' }]
      },
      read: async url => `${url.includes('spam') ? 'spam ' : ''}${'text '.repeat(60)}`,
    })
    expect(searches.map(q => q.kind)).toEqual(['web', 'github', 'arxiv'])
    // The given link first, the irrelevant repo dropped, the follow-up search read.
    expect(sources.map(s => s.url)).toEqual(['https://foo.example/docs', 'https://web.example/page', 'https://arxiv.example/page'])
    expect(report).toContain('## Key takeaways\n\nFoo works ([1](https://foo.example/docs))')
    expect(report).toContain('## What Foo is')
    expect(report).not.toContain('Repeated heading')
    expect(report).toContain('## Sources\n\n- 1. [https://foo.example/docs](https://foo.example/docs)')
  })

  it('fails loudly when nothing can be read', async () => {
    await expect(runResearch('nothing', { chat: async () => 'WEB: x', search: async () => [], read: async () => '' }))
      .rejects.toThrow('no readable sources')
  })
})
