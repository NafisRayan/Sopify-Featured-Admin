import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Copy, Droplet, Globe, Menu as MenuIcon, MoreVertical, Paintbrush,
  Pencil, Rocket, Trash2, Type,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import {
  Badge, Button, Card, CardHeader, Drawer, Input, Menu, Modal, PageHeader, Select, Toggle,
  useConfirm, useToast,
} from '@/components/ui'
import { formatDate, formatRelative } from '@/lib/format'
import { addThemeToLibrary, deleteTheme, publishTheme, updateTheme } from '@/services/settingsService'
import { useCan } from '@/lib/permissions'
import type { ThemeSettings } from '@/types'

export default function OnlineStorePage() {
  const theme = useStore((s) => s.theme)
  const themeLibrary = useStore((s) => s.themeLibrary)
  const menus = useStore((s) => s.menus)
  const { toast } = useToast()
  const { confirm, confirmElement } = useConfirm()
  const [customizerOpen, setCustomizerOpen] = useState(false)
  const [draft, setDraft] = useState<ThemeSettings>(theme)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const canEdit = useCan('products', 'edit')

  const openCustomizer = () => {
    setDraft(structuredClone(theme))
    setCustomizerOpen(true)
  }

  const current = themeLibrary.find((t) => t.role === 'current')
  const others = themeLibrary.filter((t) => t.role !== 'current')

  return (
    <div>
      {confirmElement}
      <PageHeader
        title="Themes"
        subtitle="Your storefront's look and feel"
        primaryAction={
          canEdit && (
            <Button variant="primary" icon={<Paintbrush size={13} />} onClick={openCustomizer}>
              Customize
            </Button>
          )
        }
      />

      {/* Current theme */}
      <Card padding={false} className="mb-4">
        <div className="grid gap-0 md:grid-cols-2">
          <div className="border-b border-border p-4 md:border-b-0 md:border-r">
            {current && <img src={current.imageSrc} alt={`${current.name} preview`} className="aspect-[16/10] w-full rounded-lg border border-border object-cover" />}
          </div>
          <div className="p-4 md:p-5">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold">{current?.name ?? theme.activeTheme}</h2>
              <Badge tone="success" dot>Live</Badge>
            </div>
            <p className="mt-0.5 text-xs text-text-muted">
              v{current?.version} · added {current ? formatDate(current.addedAt) : '—'}
            </p>
            <p className="mt-3 text-[13px] text-text-muted">
              Customize colors, typography and product layout. Changes apply store-wide instantly in this demo.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {canEdit && (
                <Button variant="primary" icon={<Paintbrush size={13} />} onClick={openCustomizer}>
                  Customize
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Quick links */}
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <Link to="/online-store/navigation">
          <Card className="flex items-center gap-3 transition-colors hover:border-border-strong">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f1f1f1]"><MenuIcon size={16} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold">Navigation</span>
              <span className="block text-xs text-text-muted">
                {menus.length} menus · {menus.reduce((s, m) => s + m.items.length, 0)} top-level links
              </span>
            </span>
          </Card>
        </Link>
        <Link to="/online-store/preferences">
          <Card className="flex items-center gap-3 transition-colors hover:border-border-strong">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f1f1f1]"><Globe size={16} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold">Preferences</span>
              <span className="block text-xs text-text-muted">Homepage title, password page and contact info</span>
            </span>
          </Card>
        </Link>
      </div>

      {/* Theme library */}
      <Card padding={false}>
        <CardHeader title="Theme library" subtitle={`${others.length} theme${others.length === 1 ? '' : 's'} added`} />
        <ul className="divide-y divide-border">
          {others.length === 0 && (
            <li className="px-4 py-8 text-center text-[13px] text-text-muted">No other themes in your library.</li>
          )}
          {others.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <img src={t.imageSrc} alt="" className="h-14 w-24 shrink-0 rounded-md border border-border object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{t.name}</p>
                <p className="text-xs text-text-muted">v{t.version} · added {formatRelative(t.addedAt)}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {canEdit && (
                  <>
                    <Button size="sm" icon={<Rocket size={12} />} onClick={() => void publishTheme(t.id).then(() => toast(`${t.name} published — it is now your live theme`))}>
                      Publish
                    </Button>
                    <Menu
                      trigger={
                        <Button size="sm" aria-label={`More actions for ${t.name}`}>
                          <MoreVertical size={13} />
                        </Button>
                      }
                      items={[
                        { label: 'Rename', icon: <Pencil size={12} />, onClick: () => { setRenaming(t.id); setRenameValue(t.name) } },
                        { label: 'Duplicate', icon: <Copy size={12} />, onClick: () => void addThemeToLibrary(`${t.name} copy`).then(() => toast('Theme duplicated')) },
                        {
                          label: 'Remove', icon: <Trash2 size={12} />, destructive: true,
                          onClick: () =>
                            confirm({
                              title: `Remove ${t.name}?`,
                              body: 'The theme will be removed from your library. Your live theme is unaffected.',
                              confirmLabel: 'Remove',
                              destructive: true,
                              onConfirm: async () => {
                                await deleteTheme(t.id)
                                toast('Theme removed', { tone: 'critical' })
                              },
                            }),
                        },
                      ]}
                    />
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* Customizer drawer */}
      <Drawer
        open={customizerOpen}
        onClose={() => setCustomizerOpen(false)}
        title="Theme customizer"
        subtitle={`${current?.name ?? theme.activeTheme} · changes save to the live theme`}
        footer={
          <>
            <Button onClick={() => setCustomizerOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={async () => {
                await updateTheme(draft)
                toast('Theme updated')
                setCustomizerOpen(false)
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold"><Droplet size={12} /> Colors</p>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ['primary', 'Primary (buttons)'],
                  ['background', 'Background'],
                  ['text', 'Text'],
                  ['accent', 'Accent (links)'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="text-xs font-medium">
                  {label}
                  <span className="mt-1 flex items-center gap-2">
                    <input
                      type="color"
                      value={draft.colors[key]}
                      onChange={(e) => setDraft({ ...draft, colors: { ...draft.colors, [key]: e.target.value } })}
                      className="h-8 w-10 cursor-pointer rounded border border-border"
                      aria-label={label}
                    />
                    <span className="text-text-muted">{draft.colors[key]}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold"><Type size={12} /> Typography</p>
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Heading font"
                value={draft.typography.headingFont}
                onChange={(e) => setDraft({ ...draft, typography: { ...draft.typography, headingFont: e.target.value } })}
                options={['Inter', 'Georgia', 'Helvetica', 'Courier New'].map((f) => ({ label: f, value: f }))}
              />
              <Select
                label="Body font"
                value={draft.typography.bodyFont}
                onChange={(e) => setDraft({ ...draft, typography: { ...draft.typography, bodyFont: e.target.value } })}
                options={['Inter', 'Georgia', 'Helvetica', 'Courier New'].map((f) => ({ label: f, value: f }))}
              />
            </div>
            <Input
              label="Base font size (px)"
              type="number"
              min="12"
              max="20"
              value={draft.typography.baseSize}
              onChange={(e) => setDraft({ ...draft, typography: { ...draft.typography, baseSize: Number(e.target.value) } })}
              className="mt-3 max-w-[160px]"
            />
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold">Product grid</p>
            <Select
              label="Columns"
              value={String(draft.productGridColumns)}
              onChange={(e) => setDraft({ ...draft, productGridColumns: Number(e.target.value) as ThemeSettings['productGridColumns'] })}
              options={[2, 3, 4].map((n) => ({ label: `${n} columns`, value: String(n) }))}
              className="max-w-[180px]"
            />
            <div className="mt-3 space-y-2.5">
              <Toggle label="Show vendor" checked={draft.showVendor} onChange={(v) => setDraft({ ...draft, showVendor: v })} />
              <Toggle label="Show quantity selector" checked={draft.showQuantitySelector} onChange={(v) => setDraft({ ...draft, showQuantitySelector: v })} />
            </div>
          </div>
        </div>
      </Drawer>

      {/* Rename modal */}
      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Rename theme" size="sm"
        footer={
          <>
            <Button onClick={() => setRenaming(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={async () => {
                const entry = themeLibrary.find((t) => t.id === renaming)
                if (entry) {
                  await deleteTheme(entry.id)
                  await addThemeToLibrary(renameValue.trim() || entry.name)
                  toast('Theme renamed')
                }
                setRenaming(null)
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <Input label="Theme name" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
      </Modal>
    </div>
  )
}
