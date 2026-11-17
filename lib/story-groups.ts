/**
 * Collapses the same story reported by several sources into one entry.
 *
 * WHY: with news outlets in the catalog, a launch arrives as four separate
 * cards (the lab's post, Techmeme, The Decoder, HN). Grouping makes the feed
 * denser, and "N sources ran this" is the best trending signal we have.
 *
 * CLIENT-SAFE and pure: runs in the Thagaval page over whatever is loaded, so
 * it follows the rail filters for free and needs no schema change.
 *
 * HOW: titles are reduced to significant tokens, each weighted by how rare it
 * is in this corpus (so "Hydrogen" counts for a lot and "LLM" for almost
 * nothing). Two titles from DIFFERENT sources match when the shared weight is
 * most of the lighter title, on at least MIN_SHARED tokens. Same-URL items
 * always match.
 *
 * Deliberately conservative — a false merge hides a story, a missed merge only
 * shows a duplicate. Candidates are compared to a group's primary only, never
 * to its other members, so groups cannot chain A~B~C into unrelated A and C.
 *
 * EMBEDDINGS: titles worded differently share too few words for the rule
 * above. GET /api/feed (source=all) compares the stored title embeddings
 * server-side (similarStories in lib/embeddings.ts) and sends each article the
 * ids it matched as `sim`; a primary listed there is a match too. Articles
 * without `sim` — every one until embeddings exist — behave exactly as before.
 *
 * ponytail: O(n²) over the loaded feed (≤ a few hundred titles, a few ms).
 */

export interface GroupableArticle {
  id: string
  source: string
  title: string
  url: string
  /** Ids of articles whose embedding says "same story"; set by GET /api/feed. */
  sim?: string[]
}

export type Grouped<T> = T & { also: T[] }

// Function words plus the launch-announcement verbs every outlet uses, which
// would otherwise make any two "X launches new Y" headlines look alike.
const STOP = new Set((
  'a an the and or but of in on at to for from by with without into over under about as is are was were be been ' +
  'it its this that these those their his her our your we you they he she i not no can could will would should may ' +
  'might how why what when where who which than then now new via vs just more most up out off after before says ' +
  'said say report reports reportedly sources source announces announced announcing announce introduces ' +
  'introducing introduce launches launched launching launch releases released release unveils unveiled debuts ' +
  'rolls rolling brings adds gets using use used show shows hn ask tell'
).split(' '))

/** Lowercase alphanumeric tokens; keeps version-like tokens ("4", "5.2", "gpt-6"). */
export function titleTokens(title: string): string[] {
  const words = title.toLowerCase().normalize('NFKD').match(/[a-z0-9]+(?:[.\-][a-z0-9]+)*/g) ?? []
  return [...new Set(words.filter(w => !STOP.has(w) && (w.length > 1 || /\d/.test(w))))]
}

const MIN_SHARED = 3
/**
 * Shared weight / the lighter title's weight. Containment, not Jaccard: a
 * 6-word lab headline and a 25-word Techmeme sentence about it share little of
 * the long one. Tuned on live headlines: true duplicates scored 0.68–1.0, the
 * nearest non-duplicates 0.49 and below.
 */
const MIN_CONTAINMENT = 0.6

function normUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase()
}

/**
 * @param articles in display priority order — the first member of a group
 *                 becomes its primary and keeps its position.
 * @param skipSources sources never grouped (digests, whose one title lists
 *                 several unrelated stories).
 */
export function groupStories<T extends GroupableArticle>(
  articles: T[],
  skipSources: ReadonlySet<string> = new Set(),
): Grouped<T>[] {
  const tokens = articles.map(a => titleTokens(a.title))
  const df = new Map<string, number>()
  for (const ts of tokens) for (const t of ts) df.set(t, (df.get(t) ?? 0) + 1)
  const n = Math.max(articles.length, 2)
  // +1 smoothing so a token in every title still weighs a little, not zero.
  const weight = (t: string) => Math.log((n + 1) / (df.get(t) ?? 1))
  const total = tokens.map(ts => ts.reduce((s, t) => s + weight(t), 0))
  const sets = tokens.map(ts => new Set(ts))
  const urls = articles.map(a => normUrl(a.url))

  const primaries: number[] = []
  const members = new Map<number, number[]>()

  articles.forEach((a, i) => {
    const groupable = !skipSources.has(a.source)
    const match = groupable ? primaries.find(p => {
      const b = articles[p]
      if (skipSources.has(b.source) || b.source === a.source) return false
      if (urls[i] && urls[i] === urls[p]) return true
      if (a.sim?.includes(b.id) || b.sim?.includes(a.id)) return true
      let shared = 0, sharedWeight = 0
      for (const t of sets[i]) if (sets[p].has(t)) { shared++; sharedWeight += weight(t) }
      if (shared < MIN_SHARED) return false
      return sharedWeight >= MIN_CONTAINMENT * Math.min(total[i], total[p])
    }) : undefined

    if (match === undefined) { primaries.push(i); members.set(i, []) }
    else members.get(match)!.push(i)
  })

  return primaries.map(p => ({ ...articles[p], also: members.get(p)!.map(i => articles[i]) }))
}
