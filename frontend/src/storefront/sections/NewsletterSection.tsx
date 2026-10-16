import { useState } from 'react'
import { Mail, Check } from 'lucide-react'

export interface NewsletterSettings {
  heading?: string
  subtext?: string
  buttonText?: string
  placeholder?: string
  backgroundColor?: string
  textColor?: string
}

export function NewsletterSection({ settings }: { settings: NewsletterSettings }) {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)

  const heading = settings.heading || 'Join the Northstar Dispatch'
  const subtext =
    settings.subtext ||
    'Receive early access to seasonal releases, editorial dispatches, and subscriber-only archive sales.'
  const buttonText = settings.buttonText || 'Subscribe'
  const placeholder = settings.placeholder || 'Enter your email address'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setSubscribed(true)
    setEmail('')
  }

  return (
    <section
      className="py-16 md:py-24"
      style={{
        backgroundColor: settings.backgroundColor || '#171717',
        color: settings.textColor || '#ffffff',
      }}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
        <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mx-auto text-white">
          <Mail size={22} />
        </div>
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight leading-tight">
          {heading}
        </h2>
        <p className="text-sm md:text-base opacity-80 max-w-lg mx-auto leading-relaxed">
          {subtext}
        </p>

        {subscribed ? (
          <div className="inline-flex items-center gap-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-5 py-3 rounded-xl text-sm font-semibold">
            <Check size={16} /> Thank you for subscribing to our dispatch!
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto pt-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={placeholder}
              className="flex-1 rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-sm text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/40 backdrop-blur-xs"
            />
            <button
              type="submit"
              className="rounded-xl bg-white text-neutral-900 px-6 py-3 text-sm font-bold hover:bg-neutral-100 transition shadow-sm"
            >
              {buttonText}
            </button>
          </form>
        )}
      </div>
    </section>
  )
}
