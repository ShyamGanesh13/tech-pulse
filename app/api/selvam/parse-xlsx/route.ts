import { NextRequest, NextResponse } from 'next/server'
import { aiCategorize } from '@/lib/ai-categorize'

const CAT_KW: [string, string[]][] = [
  ['Food & Dining',  ['swiggy','zomato','dominos','mcdonald','pizza','restaurant','cafe','blinkit','dunzo','zepto','bigbasket','kfc','burger','subway','groceries','instamart','food']],
  ['Transport',      ['ola','uber','rapido','metro','irctc','redbus','makemytrip','fuel','petrol','diesel','bounce','yulu','flight','cab','bus','trip expen','travel','trip']],
  ['Shopping',       ['amazon','flipkart','myntra','ajio','nykaa','meesho','snapdeal','reliance','croma','decathlon']],
  ['Utilities',      ['airtel','jio','bsnl','vodafone','electricity','electricit','bescom','water','gas','recharge','dth','internet','broadband','wifi','wi-fi','bill pay','bill payment','payment fr']],
  ['Entertainment',  ['netflix','spotify','hotstar','disney','bookmyshow','pvr','inox','zee5','gaana','steam','prime video']],
  ['Healthcare',     ['pharmacy','hospital','clinic','doctor','apollo','medplus','pharmeasy','1mg','netmeds','chemist','medical']],
  ['Home Rent',      ['rent','house rent','home rent','pg rent','accommodation','room rent','monthly rent','may rent','apr rent','march rent','april rent','june rent','july rent']],
  ['Finance',        ['insurance','emi','loan','sip','mutual fund','mutual fun','policy','premium','lic','ppf','fixed deposit','invest','groww','zerodha','credit card','cc bill','cc billpay','ach']],
  ['Education',      ['course','udemy','coursera','byju','unacademy','vedantu','upgrad','tuition','books','school','college']],
  ['Transfers',      ['salary','neft','imps','rtgs','cashback','refund','self']],
]

function autocat(text: string): string {
  const low = text.toLowerCase()
  for (const [cat, kw] of CAT_KW) if (kw.some(k => low.includes(k))) return cat
  return 'Other'
}

interface ParsedRemark {
  description: string   // human-readable label for the UI
  catText: string       // all meaningful text combined for categorisation
}

/**
 * Extract a clean description and categorisation text from ICICI bank remark strings.
 *
 * Formats seen in the wild:
 *  UPI/<Name>/<UPI-ID>/<Note>/<Bank>/<Ref>/...
 *  BIL/NEFT/<Ref>/<Narration>/<Payee>/<Bank>
 *  CMS/ <Ref>/<Payee>
 *  NFS/CASH WDL/<Ref>/...
 *  ACH/<Payee>/<Ref>/...
 *  <AccountNo>:Int.Pd:...
 */
function parseRemark(raw: string): ParsedRemark {
  const s = raw.trim()
  const parts = s.split('/').map(p => p.trim()).filter(Boolean)
  const type = parts[0]?.toUpperCase()

  if (type === 'UPI' && parts.length >= 2) {
    const name = toTitle(parts[1] ?? '')
    const note = parts[3] && !isBankOrRef(parts[3]) ? toTitle(parts[3]) : ''
    const description = note && note.toLowerCase() !== 'upi'
      ? `${note} — ${name}`
      : name
    // combine note + name for richer keyword matching
    const catText = `${note} ${name} ${parts[2] ?? ''}`
    return { description, catText }
  }

  if ((type === 'BIL' || type === 'NEFT') && parts.length >= 3) {
    // BIL/NEFT/ref/narration/payee/bank
    const narration = parts[3] && !isBankOrRef(parts[3]) ? toTitle(parts[3]) : ''
    const payee     = parts[4] && !isBankOrRef(parts[4]) ? toTitle(parts[4]) : ''
    const description = narration || payee || 'Bank Transfer'
    return { description, catText: `${narration} ${payee} ${s}` }
  }

  if (type === 'CMS' && parts.length >= 2) {
    const payee = parts[parts.length - 1]
    return { description: toTitle(payee), catText: payee }
  }

  if (type === 'NFS' || s.toLowerCase().includes('cash wdl') || s.toLowerCase().includes('atm')) {
    return { description: 'ATM Withdrawal', catText: 'atm withdrawal cash' }
  }

  if (type === 'ACH') {
    const payee = parts[1] ?? s
    return { description: toTitle(payee), catText: payee }
  }

  // Interest paid, misc
  return { description: toTitle(s.split('/')[0] ?? s), catText: s }
}

function isBankOrRef(s: string): boolean {
  return /^\d{6,}$/.test(s) || /^(icici|hdfc|axis|sbi|yes bank|kotak|upi|bank of|idfc|canara|union|ubi|pnb|boa)/i.test(s)
}

function toTitle(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
    .replace(/\b\w/g, c => c.toUpperCase())
    .slice(0, 60)
}

interface TxRow {
  date: string
  description: string
  amount: number
  type: 'debit' | 'credit'
  category: string
  source: string
}

type RowArray = unknown[][]

function toHeaders(row: unknown[]): string[] {
  return Array.from({ length: row.length }, (_, i) => String((row as unknown[])[i] ?? '').trim().toLowerCase())
}

function findHeaderRow(rows: RowArray): { headerIdx: number; headers: string[] } {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const headers = toHeaders(rows[i] as unknown[])
    if (headers.some(h => h === 'date' || h === 'tran date' || h === 'txn date' || h === 'transaction date' || h === 'value date')) {
      return { headerIdx: i, headers }
    }
  }
  return { headerIdx: 0, headers: toHeaders(rows[0] as unknown[]) }
}

function parseDate(raw: string): string {
  const s = String(raw ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0,10)
  return ''
}

function parsePaytm(rows: RowArray, headerIdx: number, headers: string[]): TxRow[] {
  const dateI = headers.findIndex(h => h != null && h === 'date')
  const descI = headers.findIndex(h => h != null && h.includes('transaction details'))
  const amtI  = headers.findIndex(h => h != null && h === 'amount')
  if (dateI === -1 || descI === -1 || amtI === -1) return []

  return rows.slice(headerIdx + 1).flatMap((row) => {
    const rawDate = String((row as unknown[])[dateI] ?? '').trim()
    const desc    = String((row as unknown[])[descI] ?? '').trim()
    const rawAmt  = String((row as unknown[])[amtI]  ?? '').trim()
    if (!rawDate || !desc || !rawAmt) return []
    const [dd, mm, yyyy] = rawDate.split('/')
    if (!yyyy) return []
    const date    = `${yyyy}-${(mm ?? '01').padStart(2,'0')}-${(dd ?? '01').padStart(2,'0')}`
    const cleaned = rawAmt.replace(/[,\s]/g, '')
    const amount  = Math.abs(parseFloat(cleaned) || 0)
    if (amount === 0) return []
    const type: 'debit' | 'credit' = cleaned.startsWith('-') ? 'debit' : 'credit'
    return [{ date, description: desc, amount, type, category: autocat(desc), source: 'paytm' }]
  })
}

function parseGenericBank(rows: RowArray, headerIdx: number, headers: string[], source: string): TxRow[] {
  const fi = (names: string[]) =>
    names.reduce<number>((found, name) => found !== -1 ? found : headers.findIndex(h => h != null && h.includes(name)), -1)

  const dateI  = fi(['date','tran date','txn date','transaction date','value date'])
  const descI  = fi(['transaction remarks','transaction details','narration','particulars','remarks','description'])
  const debitI = fi(['withdrawal amount','debit amount','withdrawal','debit'])
  const creditI= fi(['deposit amount','credit amount','deposit','credit'])
  const amtI   = (debitI === -1 && creditI === -1) ? headers.findIndex(h => h != null && h === 'amount') : -1

  if (dateI === -1 || descI === -1) return []

  return rows.slice(headerIdx + 1).flatMap((row) => {
    const r = row as unknown[]
    const rawDate = String(r[dateI] ?? '').trim()
    const rawDesc = String(r[descI] ?? '').trim()
    if (!rawDate || !rawDesc) return []

    const date = parseDate(rawDate)
    if (!date) return []

    const { description, catText } = parseRemark(rawDesc)

    let amount = 0, type: 'debit' | 'credit' = 'debit'
    if (debitI !== -1 && creditI !== -1) {
      const d = Math.abs(parseFloat(String(r[debitI] ?? '').replace(/[,\s₹]/g,'')) || 0)
      const c = Math.abs(parseFloat(String(r[creditI] ?? '').replace(/[,\s₹]/g,'')) || 0)
      if (c > 0) { amount = c; type = 'credit' }
      else if (d > 0) { amount = d; type = 'debit' }
    } else if (amtI !== -1) {
      const raw = String(r[amtI] ?? '').replace(/[,\s₹]/g,'')
      amount = Math.abs(parseFloat(raw) || 0)
      type = raw.startsWith('-') ? 'debit' : 'credit'
    }

    if (amount === 0) return []
    return [{ date, description, amount, type, category: autocat(catText), source }]
  })
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file     = formData.get('file') as File | null
    const source   = String(formData.get('source') ?? 'bank')
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require('xlsx')
    const wb   = XLSX.read(buffer, { type: 'buffer' })

    const sheetName = wb.SheetNames.includes('Passbook Payment History')
      ? 'Passbook Payment History'
      : wb.SheetNames[0]
    const sheet = wb.Sheets[sheetName]
    const rows: RowArray = XLSX.utils.sheet_to_json(sheet, { header: 1 })

    if (rows.length < 2) {
      return NextResponse.json({ error: 'No data found in spreadsheet' }, { status: 422 })
    }

    const { headerIdx, headers } = findHeaderRow(rows)

    let transactions = parsePaytm(rows, headerIdx, headers)
    if (transactions.length === 0) {
      transactions = parseGenericBank(rows, headerIdx, headers, source)
    }

    if (transactions.length === 0) {
      return NextResponse.json({
        error: 'No transactions found. Make sure this is a bank or Paytm statement XLSX/XLS.',
      }, { status: 422 })
    }

    // AI fallback: re-categorize any transactions that keyword-matching left as "Other"
    const otherItems = transactions
      .map((tx, idx) => ({ id: idx, description: tx.description }))
      .filter((_, idx) => transactions[idx].category === 'Other')
    if (otherItems.length > 0) {
      const aiMap = await aiCategorize(otherItems)
      for (const item of otherItems) {
        const suggested = aiMap.get(item.id)
        if (suggested && suggested !== 'Other') {
          transactions[item.id].category = suggested
        }
      }
    }

    return NextResponse.json({ transactions, total: transactions.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('XLSX parse error:', msg)
    return NextResponse.json({ error: `Failed to parse XLSX file: ${msg}` }, { status: 500 })
  }
}
