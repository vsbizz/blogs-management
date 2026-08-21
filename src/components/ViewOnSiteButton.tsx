'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { getBlogLink } from '@/lib/siteUrls'

/**
 * "View on site" link in the post edit view.
 *
 * Reads slug and status straight from the form context. The previous version
 * fetched /api/posts/:id on mount to get the same two fields, which was an
 * extra round trip and went stale as soon as the editor changed the status.
 */
export default function ViewOnSiteButton() {
  const { data } = useDocumentInfo()
  const doc = data as { slug?: string; status?: string } | undefined

  if (!doc?.slug || doc.status !== 'published') return null

  const { href, isLive } = getBlogLink(doc.slug)

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="igg-btn igg-btn--ghost">
      {isLive ? 'View on site' : 'Preview post'}
    </a>
  )
}