import config from '@payload-config'
import Link from 'next/link'
import { getPayload } from 'payload'
import type { AdminViewServerProps } from 'payload'
import { getBlogLink } from '@/lib/siteUrls'

/**
 * Replaces the bare "here are your collections" default dashboard with
 * something an editor can act on: how much is published, what is still in
 * draft, and shortcuts into the common tasks.
 *
 * Runs on the server so the counts come from one round trip with no client
 * polling, and respects access control by passing the logged-in user through.
 */
export default async function DashboardOverview({ user }: AdminViewServerProps) {
  const payload = await getPayload({ config })
  const currentUser = user as { id?: string | number; name?: string; role?: string } | undefined
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'master-admin'

  const countPosts = async (where: Record<string, unknown>) => {
    try {
      const res = await payload.count({
        collection: 'posts',
        where: where as never,
        overrideAccess: false,
        user: (currentUser ?? null) as never,
      })
      return res.totalDocs
    } catch {
      return 0
    }
  }

  const [published, drafts, pendingApprovals] = await Promise.all([
    countPosts({ status: { equals: 'published' } }),
    countPosts({ status: { equals: 'draft' } }),
    isAdmin
      ? payload
          .count({
            collection: 'user-approvals',
            where: { status: { equals: 'pending' } } as never,
            overrideAccess: true,
          })
          .then((r) => r.totalDocs)
          .catch(() => 0)
      : Promise.resolve(0),
  ])

  const firstName = currentUser?.name?.split(' ')[0]
  const blog = getBlogLink()

  const stats = [
    { label: 'Published', value: published, tone: 'teal' as const },
    { label: 'Drafts', value: drafts, tone: 'gold' as const },
    ...(isAdmin
      ? [{ label: 'Pending approvals', value: pendingApprovals, tone: 'navy' as const }]
      : []),
  ]

  return (
    <section className="igg-dash">
      <header className="igg-dash__header">
        <div>
          <p className="igg-dash__eyebrow">IGG Axion Blog CMS</p>
          <h1 className="igg-dash__title">
            {firstName ? `Welcome back, ${firstName}.` : 'Welcome back.'}
          </h1>
          <p className="igg-dash__subtitle">
            Write, review and publish articles for iggaxion.ai.
          </p>
        </div>

        <div className="igg-dash__actions">
          <Link href="/admin/collections/posts/create" className="igg-dash__btn igg-dash__btn--primary">
            New post
          </Link>
          <a
            href={blog.href}
            target="_blank"
            rel="noopener noreferrer"
            className="igg-dash__btn igg-dash__btn--ghost"
          >
            {blog.isLive ? 'View live blog' : 'Preview blog'}
          </a>
        </div>
      </header>

      <div className="igg-dash__stats">
        {stats.map((stat) => (
          <div key={stat.label} className={`igg-stat igg-stat--${stat.tone}`}>
            <span className="igg-stat__value">{stat.value}</span>
            <span className="igg-stat__label">{stat.label}</span>
          </div>
        ))}
      </div>

      {drafts > 0 && (
        <p className="igg-dash__hint">
          You have {drafts} unpublished {drafts === 1 ? 'draft' : 'drafts'}.{' '}
          <Link href="/admin/collections/posts?where[status][equals]=draft">Review them</Link>
        </p>
      )}
    </section>
  )
}