import { NextRequest, NextResponse } from 'next/server'

const CAT_KW: [string, string[]][] = [
  ['Food & Dining',  ['swiggy','zomato','dominos','mcdonald','pizza','restaurant','cafe','blinkit','dunzo','zepto','bigbasket','kfc','burger','subway','food','supermarket','groceries','instamart']],
  ['Transport',      ['ola','uber','rapido','metro','irctc','redbus','makemytrip','fuel','petrol','diesel','bounce','yulu','flight','cab','bus']],
  ['Shopping',       ['amazon','flipkart','myntra','ajio','nykaa','meesho','snapdeal','reliance','croma','decathlon']],
  ['Utilities',      ['airtel','jio','bsnl','vodafone','electricity','bescom','water','gas','recharge','dth','internet','broadband','bill payment']],
  ['Entertainment',  ['netflix','spotify','amazon prime','hotstar','disney','bookmyshow','pvr','inox','zee5','gaana','steam']],
  ['Healthcare',     ['pharmacy','hospital','clinic','doctor','apollo','medplus','pharmeasy','1mg','netmeds','chemist','medical']],
  ['Finance',        ['insurance','emi','loan','sip','mutual fund','policy','premium','lic','ppf','fixed deposit']],
  ['Education',      ['course','udemy','coursera','byju','unacademy','vedantu','upgrad','tuition','books']],
  ['Transfers',      ['transfer','neft','imps','rtgs','cashback','refund','received from','paid to','upi']],
]

function autocat(desc: string): string {
  const low = desc.toLowerCase()
  for (const [cat, kw] of CAT_KW) if (kw.some(k => low.includes(k))) return cat
  return 'Other'
}

function parseDate(raw: string): string {
  const s = String(raw ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // DD/MM/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
  // Try JS Date parse
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0,10)
  return ''
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

function findHeaderRow(rows: RowArray): { headerIdx: number; headers: string[] } {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const headers = (rows[i] as string[]).map(h => String(h ?? '').trim().toLowerCase())
    // A header row has at least a date column and a description/amount column
    if (headers.some(h => h === 'date' || h === 'tran date' || h === 'txn date' || h === 'transaction date' || h === 'value date')) {
      return { headerIdx: i, headers }
    }
  }
  return { headerIdx: 0, headers: (rows[0] as string[]).map(h => String(h ?? '').trim().toLowerCase()) }
}

function parsePaytm(rows: RowArray, headerIdx: number, headers: string[]): TxRow[] {
  const dateI = headers.findIndex(h => h === 'date')
  const descI = headers.findIndex(h => h.includes('transaction details'))
  const amtI  = headers.findIndex(h => h === 'amount')
  if (dateI === -1 || descI === -1 || amtI === -1) return []

  return rows.slice(headerIdx + 1).flatMap((row) => {
    const rawDate = String(row[dateI] ?? '').trim()
    const desc    = String(row[descI] ?? '').trim()
    const rawAmt  = String(row[amtI]  ?? '').trim()
    if (!rawDate || !desc || !rawAmt) return []

    const [dd, mm, yyyy] = rawDate.split('/')
    if (!yyyy) return []
    const date   = `${yyyy}-${(mm ?? '01').padStart(2,'0')}-${(dd ?? '01').padStart(2,'0')}`
    const cleaned = rawAmt.replace(/[,\s]/g, '')
    const amount  = Math.abs(parseFloat(cleaned) || 0)
    if (amount === 0) return []
    const type: 'debit' | 'credit' = cleaned.startsWith('-') ? 'debit' : 'credit'
    return [{ date, description: desc, amount, type, category: autocat(desc), source: 'paytm' }]
  })
}

function parseGenericBank(rows: RowArray, headerIdx: number, headers: string[], source: string): TxRow[] {
  // Find date column
  const dateI = [
    'date','tran date','txn date','transaction date','value date',
  ].reduce<number>((found, name) => found !== -1 ? found : headers.findIndex(h => h.includes(name)), -1)

  // Find description column
  const descI = [
    'description','narration','particulars','remarks','transaction details','transaction remarks',
  ].reduce<number>((found, name) => found !== -1 ? found : headers.findIndex(h => h.includes(name)), -1)

  // Find debit/credit columns
  const debitI = ['debit','withdrawal','debit amount','withdrawal amount'].reduce<number>(
    (found, name) => found !== -1 ? found : headers.findIndex(h => h.includes(name)), -1)
  const creditI = ['credit','deposit','credit amount','deposit amount'].reduce<number>(
    (found, name) => found !== -1 ? found : headers.findIndex(h => h.includes(name)), -1)

  // Single amount column fallback
  const amtI = debitI === -1 && creditI === -1
    ? headers.findIndex(h => h === 'amount')
    : -1

  if (dateI === -1 || descI === -1) return []

  return rows.slice(headerIdx + 1).flatMap((row) => {
    const rawDate = String(row[dateI] ?? '').trim()
    const desc    = String(row[descI] ?? '').trim()
    if (!rawDate || !desc) return []

    const date = parseDate(rawDate)
    if (!date) return []

    let amount = 0, type: 'debit' | 'credit' = 'debit'

    if (debitI !== -1 && creditI !== -1) {
      const d = Math.abs(parseFloat(String(row[debitI] ?? '').replace(/[,\s₹]/g,'')) || 0)
      const c = Math.abs(parseFloat(String(row[creditI] ?? '').replace(/[,\s₹]/g,'')) || 0)
      if (c > 0) { amount = c; type = 'credit' }
      else if (d > 0) { amount = d; type = 'debit' }
    } else if (amtI !== -1) {
      const raw = String(row[amtI] ?? '').replace(/[,\s₹]/g,'')
      amount = Math.abs(parseFloat(raw) || 0)
      type = raw.startsWith('-') ? 'debit' : 'credit'
    }

    if (amount === 0) return []
    return [{ date, description: desc, amount, type, category: autocat(desc), source }]
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

    // Pick best sheet: Paytm uses "Passbook Payment History", banks use first sheet
    const sheetName = wb.SheetNames.includes('Passbook Payment History')
      ? 'Passbook Payment History'
      : wb.SheetNames[0]
    const sheet = wb.Sheets[sheetName]
    const rows: RowArray = XLSX.utils.sheet_to_json(sheet, { header: 1 })

    if (rows.length < 2) {
      return NextResponse.json({ error: 'No data found in spreadsheet' }, { status: 422 })
    }

    const { headerIdx, headers } = findHeaderRow(rows)

    // Try Paytm-specific format first
    let transactions = parsePaytm(rows, headerIdx, headers)

    // Fall back to generic bank statement parser
    if (transactions.length === 0) {
      transactions = parseGenericBank(rows, headerIdx, headers, source)
    }

    if (transactions.length === 0) {
      return NextResponse.json({
        error: 'No transactions found. Make sure this is a bank or Paytm statement XLSX.',
      }, { status: 422 })
    }

    return NextResponse.json({ transactions, total: transactions.length })
  } catch (err) {
    console.error('XLSX parse error:', err)
    return NextResponse.json({ error: 'Failed to parse XLSX file' }, { status: 500 })
  }
}
