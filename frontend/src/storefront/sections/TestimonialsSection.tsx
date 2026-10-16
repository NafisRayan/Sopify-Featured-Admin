import { Star } from 'lucide-react'

export interface TestimonialsSettings {
  title?: string
  quote1?: string
  author1?: string
  role1?: string
  quote2?: string
  author2?: string
  role2?: string
  quote3?: string
  author3?: string
  role3?: string
}

export function TestimonialsSection({ settings }: { settings: TestimonialsSettings }) {
  const title = settings.title || 'What Our Customers Say'
  const testimonials = [
    {
      quote:
        settings.quote1 ||
        'The canvas tote and leather field journal have accompanied me on four continents. The patina improves with every trip.',
      author: settings.author1 || 'Elena Vance',
      role: settings.role1 || 'Architect & Traveler',
    },
    {
      quote:
        settings.quote2 ||
        'Unrivaled build quality. You can tell immediately that these pieces are engineered without cutting corners.',
      author: settings.author2 || 'Marcus Brody',
      role: settings.role2 || 'Industrial Designer',
    },
    {
      quote:
        settings.quote3 ||
        'Ordering was instantaneous, and my package arrived within two days in 100% recyclable packaging. Exceptional standard.',
      author: settings.author3 || 'Sophia Lin',
      role: settings.role3 || 'Creative Director',
    },
  ]

  return (
    <section className="bg-neutral-50 py-16 md:py-24 border-y border-neutral-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-xl mx-auto mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 tracking-tight">{title}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((t, idx) => (
            <div
              key={idx}
              className="bg-white rounded-2xl p-6 md:p-8 border border-neutral-200/80 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex gap-1 text-amber-400 mb-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={15} fill="currentColor" />
                  ))}
                </div>
                <p className="text-sm text-neutral-700 leading-relaxed italic mb-6">
                  “{t.quote}”
                </p>
              </div>
              <div className="border-t border-neutral-100 pt-4">
                <span className="text-sm font-bold text-neutral-900 block">{t.author}</span>
                <span className="text-xs text-neutral-400 block mt-0.5">{t.role}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
