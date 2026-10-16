import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Lock, Mail, ArrowRight, ShieldCheck } from 'lucide-react'
import { useStorefrontCustomer } from '@/store/useStorefrontCustomer'

export function CustomerLoginPage() {
  const navigate = useNavigate()
  const { login, isLoading, error } = useStorefrontCustomer()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const success = await login(email.trim(), password)
    if (success) {
      navigate('/store/account')
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16 sm:py-24">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-extrabold text-neutral-900 tracking-tight">Sign In</h1>
        <p className="text-sm text-neutral-500 mt-2">
          Access your order history, live tracking, and saved address book.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-neutral-200/90 shadow-sm p-6 sm:p-8">
        {error && (
          <div className="mb-6 p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Email Address
            </label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane.doe@example.com"
                className="w-full rounded-xl border border-neutral-300 pl-10 pr-3.5 py-2.5 text-sm focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 outline-none"
              />
              <Mail size={16} className="absolute left-3.5 top-3 text-neutral-400" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-neutral-700">Password</label>
              <span className="text-[11px] text-neutral-400">Encrypted</span>
            </div>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-neutral-300 pl-10 pr-3.5 py-2.5 text-sm focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 outline-none"
              />
              <Lock size={16} className="absolute left-3.5 top-3 text-neutral-400" />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 px-4 text-sm font-bold text-white shadow-sm hover:bg-neutral-800 disabled:opacity-50 transition active:scale-[0.99] mt-2"
          >
            {isLoading ? (
              <>
                <span className="inline-block animate-spin mr-1">↻</span> Signing In...
              </>
            ) : (
              <>
                Sign In <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-neutral-150 text-center text-xs text-neutral-500">
          Don't have an account yet?{' '}
          <Link
            to="/store/account/register"
            className="font-semibold text-neutral-900 hover:underline"
          >
            Create an account
          </Link>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-center gap-2 text-xs text-neutral-400">
        <ShieldCheck size={14} className="text-emerald-600" />
        <span>Shopify Storefront API Customer Session Security</span>
      </div>
    </div>
  )
}
