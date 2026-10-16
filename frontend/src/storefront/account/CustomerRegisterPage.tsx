import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { User, Lock, Mail, ArrowRight, ShieldCheck } from 'lucide-react'
import { useStorefrontCustomer } from '@/store/useStorefrontCustomer'

export function CustomerRegisterPage() {
  const navigate = useNavigate()
  const { register, isLoading, error } = useStorefrontCustomer()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [acceptsMarketing, setAcceptsMarketing] = useState(true)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const success = await register({
      email: email.trim(),
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      acceptsMarketing,
    })
    if (success) {
      navigate('/store/account')
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16 sm:py-24">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-extrabold text-neutral-900 tracking-tight">Create Account</h1>
        <p className="text-sm text-neutral-500 mt-2">
          Join to track orders, save your delivery addresses, and enjoy faster checkout.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-neutral-200/90 shadow-sm p-6 sm:p-8">
        {error && (
          <div className="mb-6 p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                First Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Sarah"
                  className="w-full rounded-xl border border-neutral-300 pl-9 pr-3 py-2.5 text-sm focus:border-neutral-900 outline-none"
                />
                <User size={15} className="absolute left-3 top-3 text-neutral-400" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Last Name
              </label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Connor"
                className="w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-sm focus:border-neutral-900 outline-none"
              />
            </div>
          </div>

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
                placeholder="sarah.connor@example.com"
                className="w-full rounded-xl border border-neutral-300 pl-10 pr-3.5 py-2.5 text-sm focus:border-neutral-900 outline-none"
              />
              <Mail size={16} className="absolute left-3.5 top-3 text-neutral-400" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Password (min. 8 characters)
            </label>
            <div className="relative">
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-neutral-300 pl-10 pr-3.5 py-2.5 text-sm focus:border-neutral-900 outline-none"
              />
              <Lock size={16} className="absolute left-3.5 top-3 text-neutral-400" />
            </div>
          </div>

          <label className="flex items-start gap-2.5 pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptsMarketing}
              onChange={(e) => setAcceptsMarketing(e.target.checked)}
              className="mt-0.5 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
            />
            <span className="text-xs text-neutral-600 leading-normal">
              Subscribe to editorial dispatches, archive releases, and member perks.
            </span>
          </label>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 px-4 text-sm font-bold text-white shadow-sm hover:bg-neutral-800 disabled:opacity-50 transition active:scale-[0.99] mt-2"
          >
            {isLoading ? (
              <>
                <span className="inline-block animate-spin mr-1">↻</span> Creating Account...
              </>
            ) : (
              <>
                Create Account <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-neutral-150 text-center text-xs text-neutral-500">
          Already have an account?{' '}
          <Link to="/store/account/login" className="font-semibold text-neutral-900 hover:underline">
            Sign in
          </Link>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-center gap-2 text-xs text-neutral-400">
        <ShieldCheck size={14} className="text-emerald-600" />
        <span>Scrypt Cryptographic Password Security</span>
      </div>
    </div>
  )
}
