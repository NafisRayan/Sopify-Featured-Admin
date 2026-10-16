import type { ComponentType } from 'react'
import { HeroBannerSection } from './sections/HeroBannerSection'
import { FeaturedCollectionSection } from './sections/FeaturedCollectionSection'
import { ImageWithTextSection } from './sections/ImageWithTextSection'
import { RichTextSection } from './sections/RichTextSection'
import { TestimonialsSection } from './sections/TestimonialsSection'
import { NewsletterSection } from './sections/NewsletterSection'

export interface ThemeSectionConfig {
  id: string
  type: string
  settings: Record<string, any>
}

export interface ThemePageLayout {
  sections: Record<string, ThemeSectionConfig>
  order: string[]
}

export const SECTION_COMPONENTS: Record<string, ComponentType<{ settings: any }>> = {
  'hero-banner': HeroBannerSection,
  'featured-collection': FeaturedCollectionSection,
  'image-with-text': ImageWithTextSection,
  'rich-text': RichTextSection,
  'testimonials': TestimonialsSection,
  'newsletter': NewsletterSection,
}

export const SECTION_DEFINITIONS = [
  {
    type: 'hero-banner',
    label: 'Hero Banner',
    description: 'Prominent headline, background styling, and CTA button.',
    defaultSettings: {
      heading: 'Purpose-built goods for everyday living.',
      subheading: 'Explore durable apparel and handcrafted leather goods.',
      badgeText: 'New Season 2026',
      buttonText: 'Explore Products',
      buttonLink: '#catalog',
      secondaryButtonText: 'View Collections',
      secondaryButtonLink: '#featured-collections',
      alignment: 'left',
      backgroundColor: '#171717',
      textColor: '#ffffff',
    },
  },
  {
    type: 'featured-collection',
    label: 'Featured Products',
    description: 'Dynamic product grid populated directly from your catalog.',
    defaultSettings: {
      title: 'Featured Collection',
      subtitle: 'Top-selling goods built for enduring resilience',
      productsToShow: 8,
      showVendor: true,
      showQuickAdd: true,
    },
  },
  {
    type: 'image-with-text',
    label: 'Image with Text',
    description: 'Split section pairing high-impact media with brand storytelling.',
    defaultSettings: {
      heading: 'Crafted with integrity and intention',
      subtext: 'Every material is chosen to outlast fleeting seasonal trends.',
      imageSrc: '/images/collections/leather-goods.svg',
      layout: 'image-left',
      buttonText: 'Our Story',
      buttonLink: '#about',
      backgroundColor: '#fafafa',
    },
  },
  {
    type: 'rich-text',
    label: 'Rich Text',
    description: 'Editorial brand statement, announcement, or mission text.',
    defaultSettings: {
      heading: 'A Commitment to Longevity',
      text: 'We engineer goods intended to serve you for decades, not months.',
      alignment: 'center',
      maxWidth: 'md',
      backgroundColor: '#ffffff',
      textColor: '#171717',
    },
  },
  {
    type: 'testimonials',
    label: 'Customer Testimonials',
    description: 'Social proof quotes and star reviews from authentic shoppers.',
    defaultSettings: {
      title: 'Loved by Travelers & Creators',
      quote1: 'The canvas tote and field journal have lasted me years across four continents.',
      author1: 'Elena Vance',
      role1: 'Architect & Traveler',
      quote2: 'Unrivaled build quality. You can tell immediately that no corners were cut.',
      author2: 'Marcus Brody',
      role2: 'Industrial Designer',
      quote3: 'Dispatched within hours and delivered in sustainable packaging.',
      author3: 'Sophia Lin',
      role3: 'Creative Director',
    },
  },
  {
    type: 'newsletter',
    label: 'Email Newsletter',
    description: 'Email capture input for marketing dispatches and product launches.',
    defaultSettings: {
      heading: 'Join the Northstar Dispatch',
      subtext: 'Receive early access to seasonal releases and subscriber-only archive sales.',
      buttonText: 'Subscribe',
      placeholder: 'Enter your email address',
      backgroundColor: '#171717',
      textColor: '#ffffff',
    },
  },
]

export const DEFAULT_PAGE_LAYOUT: ThemePageLayout = {
  sections: {
    hero_banner: {
      id: 'hero_banner',
      type: 'hero-banner',
      settings: SECTION_DEFINITIONS[0].defaultSettings,
    },
    featured_collection: {
      id: 'featured_collection',
      type: 'featured-collection',
      settings: SECTION_DEFINITIONS[1].defaultSettings,
    },
    image_text: {
      id: 'image_text',
      type: 'image-with-text',
      settings: SECTION_DEFINITIONS[2].defaultSettings,
    },
    testimonials: {
      id: 'testimonials',
      type: 'testimonials',
      settings: SECTION_DEFINITIONS[4].defaultSettings,
    },
    newsletter: {
      id: 'newsletter',
      type: 'newsletter',
      settings: SECTION_DEFINITIONS[5].defaultSettings,
    },
  },
  order: ['hero_banner', 'featured_collection', 'image_text', 'testimonials', 'newsletter'],
}

export function StorefrontSectionRenderer({ layout }: { layout: ThemePageLayout }) {
  if (!layout?.order || !layout.sections) {
    return null
  }

  return (
    <div className="storefront-sections-flow">
      {layout.order.map((sectionId) => {
        const sectionConfig = layout.sections[sectionId]
        if (!sectionConfig) return null

        const Component = SECTION_COMPONENTS[sectionConfig.type]
        if (!Component) {
          return null
        }

        return (
          <div key={sectionId} id={`section-${sectionId}`} data-section-type={sectionConfig.type}>
            <Component settings={sectionConfig.settings || {}} />
          </div>
        )
      })}
    </div>
  )
}
