import { ShieldCheck, Store } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Badge, Button, Card, EmptyState, PageHeader, useConfirm, useToast } from '@/components/ui'
import { installApp, toggleApp, uninstallApp } from '@/services/settingsService'
import { useCan } from '@/lib/permissions'
import type { AppEntry } from '@/types'

export default function AppsPage() {
  const apps = useStore((s) => s.apps)
  const suggestions = useStore((s) => s.appSuggestions)
  const { toast } = useToast()
  const { confirm, confirmElement } = useConfirm()
  const canEdit = useCan('products', 'edit')

  return (
    <div>
      {confirmElement}
      <PageHeader
        title="Apps"
        subtitle={`${apps.filter((a) => a.status === 'installed').length} installed apps extend your store`}
      />

      {/* Installed */}
      <h2 className="mb-2 text-[13px] font-semibold">Installed</h2>
      {apps.length === 0 ? (
        <div className="mb-6 rounded-xl border border-border bg-surface">
          <EmptyState icon={Store} heading="No apps installed" message="Apps add features like reviews, loyalty, and shipping automation." />
        </div>
      ) : (
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          {apps.map((app) => (
            <AppCard key={app.id} app={app} canEdit={canEdit} />
          ))}
        </div>
      )}

      {/* Suggested */}
      <h2 className="mb-2 text-[13px] font-semibold">Suggested for your store</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {suggestions.length === 0 && (
          <Card>
            <p className="flex items-center gap-2 text-[13px] text-text-muted">
              <ShieldCheck size={15} className="text-success" />
              You have everything set up. No suggestions right now.
            </p>
          </Card>
        )}
        {suggestions.map((app) => (
          <Card key={app.id} padding={false}>
            <div className="flex items-start gap-3 p-4">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                style={{ backgroundColor: app.iconBg }}
              >
                {app.iconChar}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold">{app.name}</p>
                <p className="text-xs text-text-muted">{app.description}</p>
                <p className="mt-1 text-xs text-text-subdued">{app.category}</p>
              </div>
              {canEdit && (
                <Button size="sm" variant="primary" onClick={() => void installApp(app.id).then(() => toast(`${app.name} installed`))}>
                  Install
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )

  function AppCard({ app, canEdit }: { app: AppEntry; canEdit: boolean }) {
    return (
      <Card padding={false}>
        <div className="flex items-start gap-3 p-4">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
            style={{ backgroundColor: app.iconBg }}
          >
            {app.iconChar}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[13px] font-semibold">{app.name}</p>
              <Badge tone={app.status === 'installed' ? 'success' : 'neutral'} dot>
                {app.status === 'installed' ? 'Active' : 'Disabled'}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-text-muted">{app.description}</p>
            <p className="mt-1 text-xs text-text-subdued">
              Permissions: {app.permissions.join(', ') || 'none'}
            </p>
            {canEdit && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Button size="sm" onClick={() => void toggleApp(app.id).then(() => toast(app.status === 'installed' ? 'App disabled' : 'App enabled'))}>
                  {app.status === 'installed' ? 'Disable' : 'Enable'}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    confirm({
                      title: `Uninstall ${app.name}?`,
                      body: 'App data is retained for 30 days in case you reinstall.',
                      confirmLabel: 'Uninstall',
                      destructive: true,
                      onConfirm: async () => {
                        await uninstallApp(app.id)
                        toast(`${app.name} uninstalled`, { tone: 'critical' })
                      },
                    })
                  }
                >
                  Uninstall
                </Button>
              </div>
            )}
          </div>
        </div>
      </Card>
    )
  }
}
