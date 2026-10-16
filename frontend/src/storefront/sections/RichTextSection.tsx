export interface RichTextSettings {
  heading?: string
  text?: string
  alignment?: 'left' | 'center' | 'right'
  maxWidth?: 'sm' | 'md' | 'lg' | 'full'
  backgroundColor?: string
  textColor?: string
}

export function RichTextSection({ settings }: { settings: RichTextSettings }) {
  const heading = settings.heading || 'A Commitment to Longevity'
  const text =
    settings.text ||
    'We believe products should be purchased with the intent of enduring for years, not seasons. Every seam, rivet, and finish is chosen to outlast fleeting trends.'
  const alignment = settings.alignment || 'center'
  const maxWidth = settings.maxWidth || 'md'

  const maxWClass =
    maxWidth === 'sm'
      ? 'max-w-xl'
      : maxWidth === 'md'
      ? 'max-w-3xl'
      : maxWidth === 'lg'
      ? 'max-w-5xl'
      : 'max-w-full'

  const alignClass =
    alignment === 'center'
      ? 'text-center mx-auto'
      : alignment === 'right'
      ? 'text-right ml-auto'
      : 'text-left'

  return (
    <section
      className="py-16 md:py-20 px-4 sm:px-6 lg:px-8"
      style={{
        backgroundColor: settings.backgroundColor || '#ffffff',
        color: settings.textColor || '#171717',
      }}
    >
      <div className={`${maxWClass} ${alignClass} space-y-4`}>
        {heading && (
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight leading-tight">
            {heading}
          </h2>
        )}
        {text && <p className="text-base md:text-lg opacity-80 leading-relaxed">{text}</p>}
      </div>
    </section>
  )
}
