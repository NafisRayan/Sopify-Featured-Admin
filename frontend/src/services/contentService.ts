import { getStore } from '@/store/useStore'
import { uid } from '@/lib/id'
import { slugify } from '@/lib/validation'
import { delay } from '@/lib/delay'
import type { StorePage, BlogPost, FileAsset, NavMenu, MenuItem } from '@/types'
import { syncMutation, gqlLiteral } from './api'

// ─── Pages ─────────────────────────────────────────────────────────────────

export async function createPage(input: Partial<StorePage>): Promise<StorePage> {
  await delay(300)
  const store = getStore()
  const title = input.title?.trim() || 'Untitled page'
  if (store.pages.some((p) => p.handle === slugify(title))) {
    throw new Error('A page with this handle already exists')
  }
  const page: StorePage = {
    id: uid('page'),
    title,
    contentHtml: input.contentHtml ?? '<p></p>',
    handle: slugify(title),
    status: input.status ?? 'draft',
    seoTitle: input.seoTitle ?? title,
    seoDescription: input.seoDescription,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  store.addPage(page)
  syncMutation(`mutation { pageCreate(page: ${gqlLiteral({ title: page.title, contentHtml: page.contentHtml, handle: page.handle, status: page.status, seoTitle: page.seoTitle, seoDescription: page.seoDescription })}) { userErrors { message } } }`)
  return page
}

export async function updatePage(id: string, patch: Partial<StorePage>): Promise<void> {
  await delay(300)
  getStore().patchPage(id, { ...patch, updatedAt: new Date().toISOString() })
  const page = getStore().pages.find((p) => p.id === id)
  if (page) {
    syncMutation(`mutation { pageUpdate(id: ${gqlLiteral(id)}, page: ${gqlLiteral({ title: page.title, contentHtml: page.contentHtml, handle: page.handle, status: page.status, seoTitle: page.seoTitle, seoDescription: page.seoDescription })}) { userErrors { message } } }`)
  }
}

export async function deletePages(ids: string[]): Promise<void> {
  await delay(250)
  getStore().removePages(ids)
  syncMutation(`mutation { pageDelete(ids: ${gqlLiteral(ids)}) { userErrors { message } } }`)
}

// ─── Blog posts ────────────────────────────────────────────────────────────

export async function createPost(input: Partial<BlogPost>): Promise<BlogPost> {
  await delay(300)
  const post: BlogPost = {
    id: uid('post'),
    title: input.title?.trim() || 'Untitled post',
    author: input.author || 'Ava Chen',
    excerpt: input.excerpt ?? '',
    contentHtml: input.contentHtml ?? '<p></p>',
    imageSrc: input.imageSrc,
    tags: input.tags ?? [],
    status: input.status ?? 'draft',
    publishedAt: input.publishedAt,
  }
  getStore().addPost(post)
  syncMutation(`mutation { blogPostCreate(post: ${gqlLiteral({ title: post.title, author: post.author, excerpt: post.excerpt, contentHtml: post.contentHtml, imageSrc: post.imageSrc, tags: post.tags, status: post.status, publishedAt: post.publishedAt })}) { userErrors { message } } }`)
  return post
}

export async function updatePost(id: string, patch: Partial<BlogPost>): Promise<void> {
  await delay(300)
  getStore().patchPost(id, patch)
  const post = getStore().posts.find((p: BlogPost) => p.id === id)
  if (post) {
    syncMutation(`mutation { blogPostUpdate(id: ${gqlLiteral(id)}, post: ${gqlLiteral({ title: post.title, author: post.author, excerpt: post.excerpt, contentHtml: post.contentHtml, imageSrc: post.imageSrc, tags: post.tags, status: post.status, publishedAt: post.publishedAt })}) { userErrors { message } } }`)
  }
}

export async function deletePosts(ids: string[]): Promise<void> {
  await delay(250)
  getStore().removePosts(ids)
  syncMutation(`mutation { blogPostDelete(ids: ${gqlLiteral(ids)}) { userErrors { message } } }`)
}

// ─── Files ─────────────────────────────────────────────────────────────────

export async function addFileByUrl(url: string, name?: string): Promise<FileAsset> {
  await delay(400)
  const isImage = /\.(png|jpe?g|gif|svg|webp|avif)$/i.test(url)
  const isVideo = /\.(mp4|webm|mov)$/i.test(url)
  const derivedName = name || url.split('/').pop()?.split('?')[0] || 'asset'
  const file: FileAsset = {
    id: uid('file'),
    name: derivedName,
    type: isImage ? 'image' : isVideo ? 'video' : 'document',
    src: url,
    sizeKb: Math.floor(Math.random() * 400) + 30,
    dimensions: isImage ? { width: 640, height: 640 } : undefined,
    uploadedAt: new Date().toISOString(),
  }
  getStore().addFiles([file])
  syncMutation(`mutation { fileCreate(input: ${gqlLiteral({ url: file.src, name: file.name })}) { userErrors { message } } }`)
  return file
}

export async function renameFile(id: string, name: string): Promise<void> {
  await delay(200)
  if (!name.trim()) throw new Error('File name cannot be empty')
  getStore().patchFile(id, { name: name.trim() })
  syncMutation(`mutation { fileUpdate(id: ${gqlLiteral(id)}, name: ${gqlLiteral(name.trim())}) { userErrors { message } } }`)
}

export async function setFileAlt(id: string, alt: string): Promise<void> {
  await delay(150)
  getStore().patchFile(id, { alt })
  syncMutation(`mutation { fileUpdate(id: ${gqlLiteral(id)}, alt: ${gqlLiteral(alt)}) { userErrors { message } } }`)
}

export async function deleteFiles(ids: string[]): Promise<void> {
  await delay(250)
  getStore().removeFiles(ids)
  syncMutation(`mutation { fileDelete(ids: ${gqlLiteral(ids)}) { userErrors { message } } }`)
}

// ─── Navigation menus ──────────────────────────────────────────────────────

export async function updateMenu(handle: NavMenu['handle'], items: MenuItem[]): Promise<void> {
  await delay(250)
  const store = getStore()
  store.setMenus(store.menus.map((m) => (m.handle === handle ? { ...m, items } : m)))
  syncMutation(`mutation { menuUpdate(handle: ${gqlLiteral(handle)}, items: ${gqlLiteral(items)}) { userErrors { message } } }`)
}
/** Transform a nested list at parentId (null = root) immutably */
export function withMenuItems(
  items: MenuItem[],
  parentId: string | null,
  transform: (list: MenuItem[]) => MenuItem[],
): MenuItem[] {
  if (parentId === null) return transform(items)
  return items.map((item) =>
    item.id === parentId
      ? { ...item, children: transform(item.children) }
      : { ...item, children: withMenuItems(item.children, parentId, transform) },
  )
}
