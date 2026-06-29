import { mock } from 'bun:test'
import { Database as BunDB } from 'bun:sqlite'

// Convert @key -> $key in SQL (better-sqlite3 uses @, bun:sqlite uses $)
function rewriteSql(sql: string): string {
  return sql.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, '$$$1')
}

// Convert plain keys -> $key prefixed keys for bun:sqlite named params
function convertParams(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(params)) {
    // Strip leading @ or $ if present, then add $
    const bare = key.startsWith('@') || key.startsWith('$') ? key.slice(1) : key
    out['$' + bare] = params[key]
  }
  return out
}

class StmtShim {
  constructor(private s: ReturnType<BunDB['prepare']>) {}
  run(...args: unknown[]) {
    if (args.length === 1 && args[0] !== null && typeof args[0] === 'object' && !Array.isArray(args[0])) {
      this.s.run(convertParams(args[0] as Record<string, unknown>))
    } else {
      this.s.run(...args)
    }
  }
  get(...args: unknown[]) {
    if (args.length === 1 && args[0] !== null && typeof args[0] === 'object' && !Array.isArray(args[0])) {
      return this.s.get(convertParams(args[0] as Record<string, unknown>))
    }
    return this.s.get(...args)
  }
  all(...args: unknown[]) {
    if (args.length === 1 && args[0] !== null && typeof args[0] === 'object' && !Array.isArray(args[0])) {
      return this.s.all(convertParams(args[0] as Record<string, unknown>))
    }
    return this.s.all(...args)
  }
}

class DBShim {
  private db: BunDB
  constructor(path: string) { this.db = new BunDB(path) }
  exec(sql: string) { this.db.exec(sql) }
  prepare(sql: string) { return new StmtShim(this.db.prepare(rewriteSql(sql))) }
  transaction<T>(fn: (arg: T) => void): (arg: T) => void { return this.db.transaction(fn) }
  close() { this.db.close() }
}

mock.module('better-sqlite3', () => ({ default: DBShim }))
