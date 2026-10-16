import { DEFAULT_PAGE_LAYOUT, type ThemePageLayout } from '@/storefront/StorefrontSectionRenderer'
import { updateTheme as updateThemeApi } from './settingsService'

const THEME_LAYOUT_STORAGE_KEY = 'ns_active_theme_layout'

export function getActiveThemeLayout(): ThemePageLayout {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(THEME_LAYOUT_STORAGE_KEY)
      if (stored) return JSON.parse(stored)
    } catch {
      // fallback
    }
  }
  return DEFAULT_PAGE_LAYOUT
}

export async function saveThemeLayout(layout: ThemePageLayout): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.setItem(THEME_LAYOUT_STORAGE_KEY, JSON.stringify(layout))
  }
  try {
    await updateThemeApi({
      layout,
    } as any)
  } catch {
    // If backend only stores root theme settings, local storage guarantees instant persistence
  }
}

export async function publishThemeLayout(layout: ThemePageLayout): Promise<void> {
  await saveThemeLayout(layout)
}
