import { ArrowRight } from 'lucide-react'

export interface ImageWithTextSettings {
  heading?: string
  subtext?: string
  imageSrc?: string
  imageAlt?: string
  layout?: 'image-left' | 'image-right'
  buttonText?: string
  buttonLink?: string
  backgroundColor?: string
}

export function ImageWithTextSection({ settings }: { settings: ImageWithTextSettings }) {
  const heading = settings.heading || 'Crafted with integrity and intention'
  const subtext =
    settings.subtext ||
    'From sustainably sourced cotton textiles to durable full-grain leather, every product in our collection is manufactured in ethical workshops committed to generational craftsmanship.'
  const imageSrc = settings.imageSrc || '/images/collections/leather-goods.svg'
  const imageAlt = settings.imageAlt || 'Craftsmanship workshop'
  const isImageRight = settings.layout === 'image-right'
  const buttonText = settings.buttonText || 'Discover Our Story'
  const buttonLink = settings.buttonLink || '#about'

  return (
    <section
      className="py-16 md:py-24"
      style={{ backgroundColor: settings.backgroundColor || '#fafafa' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className={`grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-16 items-center ${
            isImageRight ? 'md:grid-flow-dense' : ''
          }`}
        >
          {/* Image */}
          <div className={`${isImageRight ? 'md:col-start-2' : ''}`}>
            <div className="aspect-[4/3] rounded-2xl overflow-hidden border border-neutral-200/80 shadow-sm bg-white">
              <img src={imageSrc} alt={imageAlt} className="w-full h-full object-cover" />
            </div>
          </div>

          {/* Text Content */}
          <div className={`${isImageRight ? 'md:col-start-1' : ''} space-y-6`}>
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Behind the craft
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-neutral-900 tracking-tight leading-tight">
              {heading}
            </h2>
            <p className="text-base text-neutral-600 leading-relaxed">{subtext}</p>
            {buttonText && (
              <a
                href={buttonLink}
                className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-6 py-3 text-sm font-semibold text-white hover:bg-neutral-800 transition"
              >
                {buttonText}
                <ArrowRight size={15} />
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
