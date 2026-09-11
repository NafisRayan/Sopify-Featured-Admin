import { useRef, useState } from 'react'
import { FileUp } from 'lucide-react'
import { Button, Modal } from '@/components/ui'
import { useToast } from '@/components/ui'
import { downloadCsv } from '@/lib/csv'
import { createProduct } from '@/services/productsService'
import { uid } from '@/lib/id'

/** Minimal RFC-4180-ish CSV parser (quotes, escaped quotes, newlines in quotes) */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else inQuotes = false
      } else cell += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (ch !== '\r') cell += ch
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

interface ImportRow {
  Title: string
  Vendor: string
  Type: string
  Status: string
  Tags: string
  Price: string
  SKU: string
}

const HEADERS = ['Title', 'Vendor', 'Type', 'Status', 'Tags', 'Price', 'SKU']

export function ProductImportModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<ImportRow[]>([])
  const [progress, setProgress] = useState<{ done: number; failed: number } | null>(null)
  const [importing, setImporting] = useState(false)

  const onFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result))
      if (parsed.length < 2) { toast('The CSV has no data rows', { tone: 'critical' }); return }
      const header = parsed[0]!.map((h) => h.trim())
      const idx = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase())
      const missing = ['Title', 'Price'].filter((h) => idx(h) === -1)
      if (missing.length) { toast(`Missing required column(s): ${missing.join(', ')}`, { tone: 'critical' }); return }
      const out: ImportRow[] = parsed.slice(1).map((r) => ({
        Title: (r[idx('Title')] ?? '').trim(),
        Vendor: (r[idx('Vendor')] ?? '').trim(),
        Type: (r[idx('Type')] ?? '').trim(),
        Status: (r[idx('Status')] ?? 'draft').trim().toLowerCase() === 'active' ? 'active' : 'draft',
        Tags: (r[idx('Tags')] ?? '').trim(),
        Price: (r[idx('Price')] ?? '0').trim(),
        SKU: (r[idx('SKU')] ?? '').trim(),
      })).filter((r) => r.Title)
      setRows(out)
      setProgress(null)
    }
    reader.readAsText(file)
  }

  const runImport = async () => {
    setImporting(true)
    let done = 0
    let failed = 0
    for (const r of rows) {
      try {
        await createProduct({
          title: r.Title,
          vendor: r.Vendor || undefined,
          productType: r.Type || undefined,
          status: (r.Status === 'active' ? 'active' : 'draft') as 'active' | 'draft',
          tags: r.Tags ? r.Tags.split('|').map((t) => t.trim()).filter(Boolean) : [],
          variants: [{ id: uid('v'), productId: '', title: 'Default Title', sku: r.SKU, price: Number(r.Price) || 0, optionValues: {}, available: true }],
        })
        done++
      } catch { failed++ }
      setProgress({ done: done + failed, failed })
    }
    setImporting(false)
    toast(`Imported ${done} product${done === 1 ? '' : 's'}${failed ? `, ${failed} failed` : ''}`)
    if (done > 0) { onImported(); onClose() }
  }

  const downloadTemplate = () =>
    downloadCsv('product-import-template', [{ Title: 'Example Product', Vendor: 'Northstar Goods', Type: 'Apparel', Status: 'draft', Tags: 'new|qa', Price: '19.99', SKU: 'EX-1' }], HEADERS.map((h) => ({ header: h, value: (r: Record<string, string>) => r[h] ?? '' })))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import products by CSV"
      size="lg"
      footer={
        <>
          <Button onClick={() => downloadTemplate()}>Download template</Button>
          <Button variant="primary" disabled={rows.length === 0 || importing} loading={importing} onClick={() => void runImport()}>
            Import {rows.length > 0 ? `${rows.length} products` : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-text-muted">
          Required columns: <strong>Title</strong>, <strong>Price</strong>. Optional: Vendor, Type, Status (active/draft), Tags (pipe-separated), SKU.
          Each row creates one product with a single default variant.
        </p>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-[#c9c9c9] px-4 py-8 text-center text-[13px] text-text-muted hover:border-accent hover:text-accent">
          <FileUp size={20} />
          {rows.length > 0 ? `${rows.length} rows ready to import` : 'Choose a CSV file, or drop one here'}
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
        </label>

        {progress && (
          <div className="rounded-lg bg-[#f1f1f1] p-2 text-xs text-text-muted">
            Processing… {progress.done}/{rows.length} {progress.failed > 0 && `(${progress.failed} failed)`}
          </div>
        )}

        {rows.length > 0 && (
          <div className="max-h-56 overflow-auto rounded-lg border border-border scroll-thin">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-[#fafafa] text-left text-text-muted">
                  {HEADERS.map((h) => <th key={h} className="px-2 py-1.5 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.slice(0, 10).map((r, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">{r.Title}</td>
                    <td className="px-2 py-1.5">{r.Vendor}</td>
                    <td className="px-2 py-1.5">{r.Type}</td>
                    <td className="px-2 py-1.5">{r.Status}</td>
                    <td className="px-2 py-1.5">{r.Tags}</td>
                    <td className="px-2 py-1.5">{r.Price}</td>
                    <td className="px-2 py-1.5">{r.SKU}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 10 && <p className="px-2 py-1.5 text-xs text-text-muted">…and {rows.length - 10} more rows</p>}
          </div>
        )}
      </div>
    </Modal>
  )
}
