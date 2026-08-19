import { createHash } from 'crypto'

/**
 * A bounded, ZCQL-safe article id for feeds whose only stable key is an RSS guid.
 *
 * The guid used to be URL-encoded straight into the id
 * (`medium:${encodeURIComponent(guid)}`). Two things wrong with that:
 *
 * 1. encodeURIComponent does NOT escape ' * ! ~ ( ) — and article ids are inlined
 *    into ZCQL, which has no parameter binding. A guid containing an apostrophe
 *    produced a syntactically broken (and injectable) query.
 * 2. article_id is varchar(128). An encoded article URL — or the title fallback —
 *    overflows that, and the insert fails.
 *
 * A truncated sha256 is stable across refreshes (same guid → same id, so upserts
 * still match), fixed width, and drawn from an alphabet that needs no escaping.
 */
export function guidId(source: string, guid: string): string {
  return `${source}:${createHash('sha256').update(guid).digest('hex').slice(0, 32)}`
}
