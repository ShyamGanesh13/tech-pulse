import type { Grouped } from './story-groups'

/**
 * The day's headline stories, shared by the "Top today" strip (client) and the
 * morning briefing (server) so the two can never disagree.
 *
 * Ranked by how many OTHER sources ran the story (the one real trending signal
 * we have), then stored relevance, then the source's own score (HN points).
 * Untagged articles are skipped: with a healthy classifier "no topics" means
 * off-topic. Digest sources are skipped because one item is several stories.
 *
 * Pure and client-safe. Input is the output of groupStories().
 */
export interface RankableStory {
  source: string
  topics?: string[]
  relevance?: number
  score?: number
}

export function topStories<T extends RankableStory>(
  stories: Grouped<T>[],
  n = 8,
  skipSources: ReadonlySet<string> = new Set(),
): Grouped<T>[] {
  return stories
    .filter(s => !skipSources.has(s.source) && (s.topics?.length ?? 0) > 0)
    .map((s, i) => ({ s, i }))
    .sort((a, b) =>
      (b.s.also.length - a.s.also.length) ||
      ((b.s.relevance ?? 0) - (a.s.relevance ?? 0)) ||
      ((b.s.score ?? 0) - (a.s.score ?? 0)) ||
      (a.i - b.i))
    .slice(0, n)
    .map(x => x.s)
}
