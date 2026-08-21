'use client'

import { getBlogLink } from '@/lib/siteUrls'

/**
 * Shortcut from the posts list to the blog.
 *
 * Labelled by destination: the CMS serves its own `/blog` preview route, so
 * calling that "live" was misleading. When NEXT_PUBLIC_PUBLIC_SITE_URL is set
 * this points at the real site instead.
 */
export default function ViewAllBlogsButton() {
  const { href, isLive } = getBlogLink()

  return (
    <div className="igg-listbar">
      <a href={href} target="_blank" rel="noopener noreferrer" className="igg-btn igg-btn--ghost">
        {isLive ? 'View live blog' : 'Preview blog'}
      </a>
    </div>
  )
}