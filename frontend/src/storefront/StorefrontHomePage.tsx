import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  StorefrontSectionRenderer,
  DEFAULT_PAGE_LAYOUT,
  type ThemePageLayout,
} from './StorefrontSectionRenderer'

export function StorefrontHomePage() {
  const [searchParams] = useSearchParams()
  const isPreview = searchParams.get('preview') === 'true'

  // Load layout from localStorage or fallback to DEFAULT_PAGE_LAYOUT
  const [layout, setLayout] = useState<ThemePageLayout>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('ns_active_theme_layout')
        if (saved) return JSON.parse(saved)
      } catch {
        // ignore parse error
      }
    }
    return DEFAULT_PAGE_LAYOUT
  })

  // Listen for real-time postMessage events from backoffice Theme Customizer
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'THEME_SECTION_UPDATE' && event.data.payload) {
        setLayout(event.data.payload)
      }
    }

    window.addEventListener('message', handleMessage)
    // Notify parent window that preview iframe is ready
    if (isPreview && window.parent !== window) {
      window.parent.postMessage({ type: 'STOREFRONT_PREVIEW_READY' }, '*')
    }

    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [isPreview])

  return (
    <div className="storefront-page-container pb-16">
      <StorefrontSectionRenderer layout={layout} />
    </div>
  )
}
