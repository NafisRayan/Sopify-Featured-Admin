import { useState } from 'react'
import { Button, Input } from '@/components/ui'
import { login } from '@/services/api'

export default function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('ava@northstargoods.com')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f1f1f1] px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#008060] text-sm font-bold text-white">
            N
          </div>
          <h1 className="text-lg font-semibold">Log in to Northstar Admin</h1>
          <p className="mt-1 text-xs text-text-muted">Staff account required for remote mode</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <Input
            label="Email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
          {error ? <p className="text-xs text-critical">{error}</p> : null}
          <Button type="submit" variant="primary" className="w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-4 text-center text-[11px] text-text-muted">
          Demo: ava@northstargoods.com / northstar123 (after seed)
        </p>
      </div>
    </div>
  )
}
