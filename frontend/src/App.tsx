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

  const verifyAuth = useCallback(async () => {
    if (!IS_REMOTE) {
      setAuthenticated(true)
      setAuthChecked(true)
      return
    }
    const staff = await checkSession()
    setAuthenticated(!!staff)
    setAuthChecked(true)
    if (staff) await refreshFromServer()
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

  if (IS_REMOTE && !authenticated) {
    return <LoginPage onSuccess={() => void verifyAuth()} />
  }

  return (
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  )
}
