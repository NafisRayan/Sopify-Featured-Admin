import { AppRoutes } from '@/app/AppRoutes'
import { AppProviders } from '@/app/providers'
import { useCallback, useEffect, useState } from 'react'
import { useUiStore } from '@/store/uiStore'
import { IS_REMOTE, refreshFromServer, checkSession } from '@/services/api'
import LoginPage from '@/features/auth/LoginPage'

export default function App() {
  const setGlobalSearchOpen = useUiStore((s) => s.setGlobalSearchOpen)
  const [authChecked, setAuthChecked] = useState(!IS_REMOTE)
  const [authenticated, setAuthenticated] = useState(!IS_REMOTE)
  const [authError, setAuthError] = useState(false)

  const verifyAuth = useCallback(async () => {
    if (!IS_REMOTE) {
      setAuthenticated(true)
      setAuthChecked(true)
      return
    }
    setAuthChecked(false)
    setAuthError(false)
    try {
      const staff = await checkSession()
      setAuthenticated(Boolean(staff))
      setAuthChecked(true)
      if (staff) await refreshFromServer()
    } catch {
      setAuthenticated(false)
      setAuthError(true)
      setAuthChecked(true)
    }
  }, [])

  useEffect(() => {
    void verifyAuth()
  }, [verifyAuth])

  // Global keyboard shortcuts (spec §57): "/" or ⌘K/Ctrl+K focuses search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault()
        setGlobalSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setGlobalSearchOpen])

  // remote mode: reconcile on focus when authenticated
  useEffect(() => {
    if (!IS_REMOTE || !authenticated) return
    const onFocus = () => void refreshFromServer()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [authenticated])

  if (!authChecked) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-text-muted">
        Loading…
      </div>
    )
  }

  if (authError) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#f1f1f1] px-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold">Admin API unavailable</h1>
          <p className="mt-2 text-sm text-text-muted">
            Check the backend connection, then try again.
          </p>
          <button
            type="button"
            className="mt-5 rounded-lg bg-[#008060] px-4 py-2 text-sm font-medium text-white hover:bg-[#006e52]"
            onClick={() => void verifyAuth()}
          >
            Retry
          </button>
        </div>
      </main>
    )
  }

  if (IS_REMOTE && !authenticated) {
    return <LoginPage onSuccess={() => void verifyAuth()} />
  }

  return (
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  )
}
