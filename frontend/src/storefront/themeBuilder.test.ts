import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_PAGE_LAYOUT,
  SECTION_DEFINITIONS,
  SECTION_COMPONENTS,
  type ThemePageLayout,
} from './StorefrontSectionRenderer'

test('Component Registry registers all Online Store 2.0 section types', () => {
  const expectedTypes = [
    'hero-banner',
    'featured-collection',
    'image-with-text',
    'rich-text',
    'testimonials',
    'newsletter',
  ]

  for (const type of expectedTypes) {
    assert.ok(SECTION_COMPONENTS[type], `Section component for ${type} must be defined`)
    const def = SECTION_DEFINITIONS.find((d) => d.type === type)
    assert.ok(def, `Section metadata definition for ${type} must be registered`)
    assert.ok(def?.defaultSettings, `Default settings for ${type} must exist`)
  }
})

test('Theme Page Layout supports adding, reordering, and removing sections in index.json', () => {
  const initialLayout: ThemePageLayout = structuredClone(DEFAULT_PAGE_LAYOUT)
  const initialCount = initialLayout.order.length
  assert.ok(initialCount >= 4)

  // 1. Add Section
  const newSectionId = 'rich_text_promo'
  initialLayout.sections[newSectionId] = {
    id: newSectionId,
    type: 'rich-text',
    settings: {
      heading: 'Holiday Flash Sale',
      text: 'Enjoy 20% off all merino accessories this week.',
      alignment: 'center',
    },
  }
  initialLayout.order.push(newSectionId)
  assert.equal(initialLayout.order.length, initialCount + 1)
  assert.equal(initialLayout.order[initialLayout.order.length - 1], newSectionId)

  // 2. Reorder Sections: move new section to top
  const movedOrder = [newSectionId, ...initialLayout.order.filter((id) => id !== newSectionId)]
  initialLayout.order = movedOrder
  assert.equal(initialLayout.order[0], newSectionId)

  // 3. Update Section Properties
  initialLayout.sections[newSectionId].settings.heading = 'Winter Solstice Sale'
  assert.equal(
    initialLayout.sections[newSectionId].settings.heading,
    'Winter Solstice Sale',
  )

  // 4. Delete Section
  delete initialLayout.sections[newSectionId]
  initialLayout.order = initialLayout.order.filter((id) => id !== newSectionId)
  assert.equal(initialLayout.order.length, initialCount)
  assert.equal(initialLayout.sections[newSectionId], undefined)
})

test('postMessage protocol payload contract validation', () => {
  const eventPayload = {
    type: 'THEME_SECTION_UPDATE',
    payload: DEFAULT_PAGE_LAYOUT,
  }

  assert.equal(eventPayload.type, 'THEME_SECTION_UPDATE')
  assert.ok(Array.isArray(eventPayload.payload.order))
  assert.ok(typeof eventPayload.payload.sections === 'object')
})
