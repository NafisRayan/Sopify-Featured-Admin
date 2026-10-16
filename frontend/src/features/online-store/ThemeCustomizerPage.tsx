import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Monitor,
  Smartphone,
  Tablet,
  Plus,
  Trash2,
  Undo2,
  Redo2,
  GripVertical,
  Settings,
  Layers,
} from 'lucide-react'
import {
  SECTION_DEFINITIONS,
  type ThemePageLayout,
  type ThemeSectionConfig,
} from '@/storefront/StorefrontSectionRenderer'
import { getActiveThemeLayout, saveThemeLayout, publishThemeLayout } from '@/services/themeBuilderService'
import { useToast } from '@/components/ui'

export default function ThemeCustomizerPage() {
  const { toast } = useToast()
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Layout state and history for Undo/Redo
  const [layout, setLayout] = useState<ThemePageLayout>(() => getActiveThemeLayout())
  const [history, setHistory] = useState<ThemePageLayout[]>([getActiveThemeLayout()])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)

  // Active selected section in Left Sidebar inspector
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [isAddSectionOpen, setIsAddSectionOpen] = useState(false)
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')

  // Sync state to iframe preview via postMessage
  const postToIframe = (updatedLayout: ThemePageLayout) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        {
          type: 'THEME_SECTION_UPDATE',
          payload: updatedLayout,
        },
        '*',
      )
    }
  }

  // Update layout and track history
  const updateLayout = (newLayout: ThemePageLayout) => {
    setLayout(newLayout)
    setIsDirty(true)
    postToIframe(newLayout)

    const nextHistory = history.slice(0, historyIndex + 1)
    nextHistory.push(newLayout)
    setHistory(nextHistory)
    setHistoryIndex(nextHistory.length - 1)
  }

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1]
      setHistoryIndex(historyIndex - 1)
      setLayout(prev)
      postToIframe(prev)
      setIsDirty(true)
    }
  }

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1]
      setHistoryIndex(historyIndex + 1)
      setLayout(next)
      postToIframe(next)
      setIsDirty(true)
    }
  }

  // Section list operations
  const moveSection = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...layout.order]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newOrder.length) return

    const temp = newOrder[index]
    newOrder[index] = newOrder[targetIndex]
    newOrder[targetIndex] = temp

    updateLayout({
      ...layout,
      order: newOrder,
    })
  }

  const removeSection = (sectionId: string) => {
    const newSections = { ...layout.sections }
    delete newSections[sectionId]
    const newOrder = layout.order.filter((id) => id !== sectionId)

    if (activeSectionId === sectionId) {
      setActiveSectionId(null)
    }

    updateLayout({
      sections: newSections,
      order: newOrder,
    })
    toast('Section removed')
  }

  const addSection = (type: string) => {
    const def = SECTION_DEFINITIONS.find((d) => d.type === type)
    if (!def) return

    const newId = `${type.replace(/-/g, '_')}_${Date.now()}`
    const newSection: ThemeSectionConfig = {
      id: newId,
      type,
      settings: structuredClone(def.defaultSettings),
    }

    const nextLayout: ThemePageLayout = {
      sections: {
        ...layout.sections,
        [newId]: newSection,
      },
      order: [...layout.order, newId],
    }

    updateLayout(nextLayout)
    setActiveSectionId(newId)
    setIsAddSectionOpen(false)
    toast(`Added ${def.label} section`)
  }

  const updateActiveSectionSetting = (key: string, value: any) => {
    if (!activeSectionId || !layout.sections[activeSectionId]) return

    const currentSection = layout.sections[activeSectionId]
    const updatedSection: ThemeSectionConfig = {
      ...currentSection,
      settings: {
        ...currentSection.settings,
        [key]: value,
      },
    }

    const nextLayout: ThemePageLayout = {
      ...layout,
      sections: {
        ...layout.sections,
        [activeSectionId]: updatedSection,
      },
    }

    updateLayout(nextLayout)
  }

  const handleSave = async () => {
    setIsSaving(true)
    await saveThemeLayout(layout)
    setIsDirty(false)
    setIsSaving(false)
    toast('Theme layout saved')
  }

  const handlePublish = async () => {
    setIsPublishing(true)
    await publishThemeLayout(layout)
    setIsDirty(false)
    setIsPublishing(false)
    toast('Theme published to live storefront!', { tone: 'success' })
  }

  // Handle iframe load handshake
  const handleIframeLoad = () => {
    postToIframe(layout)
  }

  const activeSection = activeSectionId ? layout.sections[activeSectionId] : null
  const activeDef = activeSection ? SECTION_DEFINITIONS.find((d) => d.type === activeSection.type) : null

  const viewportWidth =
    viewport === 'mobile' ? '375px' : viewport === 'tablet' ? '768px' : '100%'

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-neutral-900 text-neutral-100 font-sans">
      {/* ─── Top Bar ──────────────────────────────────────────────────────── */}
      <header className="h-14 border-b border-neutral-800 bg-neutral-950 px-4 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-4">
          <Link
            to="/online-store"
            className="flex items-center gap-2 text-xs font-semibold text-neutral-400 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-neutral-800 transition"
          >
            <ArrowLeft size={14} /> Exit Customizer
          </Link>
          <div className="h-4 w-px bg-neutral-800" />
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white">Northstar OS 2.0</span>
            <span className="text-[10px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded font-mono">
              index.json
            </span>
            {isDirty && (
              <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-medium">
                Unsaved changes
              </span>
            )}
          </div>
        </div>

        {/* Viewport Switcher & Undo/Redo */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-lg p-0.5">
            <button
              type="button"
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="p-1.5 text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400 transition"
              title="Undo"
            >
              <Undo2 size={14} />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="p-1.5 text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400 transition"
              title="Redo"
            >
              <Redo2 size={14} />
            </button>
          </div>

          <div className="h-4 w-px bg-neutral-800 mx-1" />

          {/* Device toggle */}
          <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setViewport('desktop')}
              className={`p-1.5 rounded-md transition ${
                viewport === 'desktop' ? 'bg-neutral-800 text-white shadow-xs' : 'text-neutral-400 hover:text-white'
              }`}
              title="Desktop"
            >
              <Monitor size={14} />
            </button>
            <button
              type="button"
              onClick={() => setViewport('tablet')}
              className={`p-1.5 rounded-md transition ${
                viewport === 'tablet' ? 'bg-neutral-800 text-white shadow-xs' : 'text-neutral-400 hover:text-white'
              }`}
              title="Tablet (768px)"
            >
              <Tablet size={14} />
            </button>
            <button
              type="button"
              onClick={() => setViewport('mobile')}
              className={`p-1.5 rounded-md transition ${
                viewport === 'mobile' ? 'bg-neutral-800 text-white shadow-xs' : 'text-neutral-400 hover:text-white'
              }`}
              title="Mobile (375px)"
            >
              <Smartphone size={14} />
            </button>
          </div>
        </div>

        {/* Save / Publish */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !isDirty}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white disabled:opacity-40 transition"
          >
            {isSaving ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={isPublishing}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition"
          >
            {isPublishing ? 'Publishing...' : 'Publish'}
          </button>
        </div>
      </header>

      {/* ─── Main Workspace: Left Inspector + Right Live Preview ──────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Section Tree & Settings Inspector */}
        <aside className="w-80 border-r border-neutral-800 bg-neutral-950 flex flex-col shrink-0 overflow-hidden">
          {activeSectionId && activeSection ? (
            /* Property Settings Panel */
            <div className="flex flex-col h-full">
              <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setActiveSectionId(null)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-neutral-400 hover:text-white"
                >
                  <ArrowLeft size={13} /> Back to Sections
                </button>
                <button
                  type="button"
                  onClick={() => removeSection(activeSectionId)}
                  className="text-neutral-400 hover:text-red-400 p-1"
                  title="Delete Section"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              <div className="px-4 py-3 border-b border-neutral-800/80 bg-neutral-900/50">
                <span className="text-xs font-bold text-white block">{activeDef?.label}</span>
                <span className="text-[11px] text-neutral-500 block">{activeDef?.description}</span>
              </div>

              {/* Dynamic Property Form based on active section */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
                {Object.entries(activeSection.settings || {}).map(([key, val]) => {
                  const isColor = key.toLowerCase().includes('color')
                  const isBoolean = typeof val === 'boolean'
                  const isNumber = typeof val === 'number'

                  return (
                    <div key={key} className="space-y-1.5">
                      <label className="block text-[11px] font-semibold text-neutral-400 capitalize">
                        {key.replace(/([A-Z])/g, ' $1')}
                      </label>
                      {isBoolean ? (
                        <label className="flex items-center gap-2 cursor-pointer pt-1">
                          <input
                            type="checkbox"
                            checked={val}
                            onChange={(e) => updateActiveSectionSetting(key, e.target.checked)}
                            className="rounded bg-neutral-800 border-neutral-700 text-neutral-100"
                          />
                          <span className="text-xs text-neutral-300">Enabled</span>
                        </label>
                      ) : isColor ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={String(val)}
                            onChange={(e) => updateActiveSectionSetting(key, e.target.value)}
                            className="w-8 h-8 rounded border border-neutral-700 cursor-pointer bg-transparent"
                          />
                          <input
                            type="text"
                            value={String(val)}
                            onChange={(e) => updateActiveSectionSetting(key, e.target.value)}
                            className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 text-xs text-white"
                          />
                        </div>
                      ) : isNumber ? (
                        <input
                          type="number"
                          value={Number(val)}
                          onChange={(e) => updateActiveSectionSetting(key, Number(e.target.value))}
                          className="w-full bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 text-xs text-white"
                        />
                      ) : (
                        <textarea
                          rows={String(val).length > 40 ? 3 : 1}
                          value={String(val)}
                          onChange={(e) => updateActiveSectionSetting(key, e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-neutral-600 transition"
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            /* Section Hierarchy List */
            <div className="flex flex-col h-full">
              <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-white">
                  <Layers size={14} className="text-neutral-400" />
                  <span>Template Sections</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddSectionOpen(true)}
                  className="flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-2 py-1 rounded"
                >
                  <Plus size={13} /> Add
                </button>
              </div>

              {/* Section List with Reorder Controls */}
              <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {layout.order.map((sectionId, idx) => {
                  const section = layout.sections[sectionId]
                  if (!section) return null
                  const def = SECTION_DEFINITIONS.find((d) => d.type === section.type)

                  return (
                    <div
                      key={sectionId}
                      className="group flex items-center justify-between p-2.5 rounded-lg border border-neutral-800/80 bg-neutral-900/60 hover:bg-neutral-900 hover:border-neutral-700 transition"
                    >
                      <button
                        type="button"
                        onClick={() => setActiveSectionId(sectionId)}
                        className="flex items-center gap-2.5 text-left flex-1 min-w-0"
                      >
                        <GripVertical size={13} className="text-neutral-600 shrink-0" />
                        <div className="truncate">
                          <span className="text-xs font-semibold text-neutral-200 block truncate">
                            {def?.label || section.type}
                          </span>
                          <span className="text-[10px] text-neutral-500 font-mono block">
                            {sectionId}
                          </span>
                        </div>
                      </button>

                      {/* Up/Down reordering and configure */}
                      <div className="flex items-center gap-0.5 shrink-0 opacity-80 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => moveSection(idx, 'up')}
                          disabled={idx === 0}
                          className="p-1 text-neutral-500 hover:text-white disabled:opacity-20"
                          title="Move up"
                        >
                          <ChevronUp size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSection(idx, 'down')}
                          disabled={idx === layout.order.length - 1}
                          className="p-1 text-neutral-500 hover:text-white disabled:opacity-20"
                          title="Move down"
                        >
                          <ChevronDown size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveSectionId(sectionId)}
                          className="p-1 text-neutral-400 hover:text-white ml-1"
                          title="Configure"
                        >
                          <Settings size={13} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Add Section Quick Trigger */}
              <div className="p-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsAddSectionOpen(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-neutral-700 rounded-lg text-xs font-semibold text-neutral-300 hover:text-white hover:border-neutral-500 transition"
                >
                  <Plus size={14} /> Add section
                </button>
              </div>
            </div>
          )}
        </aside>

        {/* Right Canvas: Interactive Live Storefront Preview */}
        <main className="flex-1 bg-neutral-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
          <div
            className="h-full bg-white rounded-xl shadow-2xl overflow-hidden border border-neutral-800 transition-all duration-300 flex flex-col"
            style={{ width: viewportWidth, maxWidth: '100%' }}
          >
            <div className="h-7 bg-neutral-100 border-b border-neutral-200 px-3 flex items-center gap-2 text-[11px] text-neutral-500 shrink-0">
              <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              <span className="font-mono text-[10px] ml-2 text-neutral-600 truncate">
                http://localhost:5173/store?preview=true
              </span>
            </div>
            <iframe
              ref={iframeRef}
              src="/store?preview=true"
              onLoad={handleIframeLoad}
              title="Storefront Preview"
              className="w-full flex-1 border-0"
            />
          </div>
        </main>
      </div>

      {/* ─── Add Section Drawer / Modal ────────────────────────────────────── */}
      {isAddSectionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800 mb-4">
              <h3 className="text-sm font-bold text-white">Add Section</h3>
              <button
                type="button"
                onClick={() => setIsAddSectionOpen(false)}
                className="text-neutral-400 hover:text-white text-xs"
              >
                Cancel
              </button>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {SECTION_DEFINITIONS.map((def) => (
                <button
                  key={def.type}
                  type="button"
                  onClick={() => addSection(def.type)}
                  className="w-full p-3 rounded-xl border border-neutral-800 bg-neutral-950/60 hover:bg-neutral-800 hover:border-neutral-700 text-left transition flex items-center justify-between group"
                >
                  <div>
                    <h4 className="text-xs font-bold text-white group-hover:text-emerald-400 transition">
                      {def.label}
                    </h4>
                    <p className="text-[11px] text-neutral-400 mt-0.5">{def.description}</p>
                  </div>
                  <Plus size={15} className="text-neutral-500 group-hover:text-white shrink-0 ml-2" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
