import { ArrowRight } from 'lucide-react'

export interface HeroBannerSettings {
  heading?: string
  subheading?: string
  badgeText?: string
  buttonText?: string
  buttonLink?: string
  secondaryButtonText?: string
  secondaryButtonLink?: string
  alignment?: 'left' | 'center' | 'right'
  backgroundColor?: string
  textColor?: string
}

export function HeroBannerSection({ settings }: { settings: HeroBannerSettings }) {
  const heading = settings.heading || 'Purpose-built goods for everyday living.'
  const subheading =
    settings.subheading ||
    'Explore durable apparel, handcrafted leather goods, and refined homeware curated for practical resilience.'
  const badgeText = settings.badgeText || 'Autumn & Winter 2026 Collection'
  const buttonText = settings.buttonText || 'Explore Products'
  const buttonLink = settings.buttonLink || '#catalog'
  const secondaryButtonText = settings.secondaryButtonText || 'View Collections'
  const secondaryButtonLink = settings.secondaryButtonLink || '#featured-collections'
  const alignment = settings.alignment || 'left'

  const alignClass =
    alignment === 'center'
      ? 'text-center mx-auto items-center'
      : alignment === 'right'
      ? 'text-right ml-auto items-end'
      : 'text-left items-start'

  return (
    <section
      className="relative overflow-hidden py-20 md:py-28"
      style={{
        backgroundColor: settings.backgroundColor || '#171717',
        color: settings.textColor || '#ffffff',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className={`max-w-2xl flex flex-col ${alignClass}`}>
          {badgeText && (
            <span className="inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur-xs mb-4">
              {badgeText}
            </span>
          )}
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-tight mb-6">
            {heading}
          </h1>
          <p className="text-lg opacity-85 mb-8 leading-relaxed">
            {subheading}
          </p>
          <div className="flex flex-wrap gap-4">
            {buttonText && (
              <a
                href={buttonLink}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100 transition shadow-sm"
              >
                {buttonText}
                <ArrowRight size={15} />
              </a>
            )}
            {secondaryButtonText && (
              <a
                href={secondaryButtonLink}
                className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-6 py-3.5 text-sm font-semibold text-white hover:bg-white/20 transition border border-white/20 backdrop-blur-xs"
              >
                {secondaryButtonText}
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
