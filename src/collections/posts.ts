import type { CollectionConfig, Where } from 'payload'
import { fallbackSlug, slugify, uniqueSlug } from '@/lib/slug'

const publishedOnly: Where = {
  status: {
    equals: 'published',
  },
}

const isAdminOrMaster = (user: any) => {
  return user?.role === 'admin' || user?.role === 'master-admin'
}

/**
 * Ask the public site to rebuild its cached blog pages.
 *
 * Failures are logged and swallowed: the CMS save has already succeeded by this
 * point, and the site falls back to time-based revalidation, so a network blip
 * here must not surface as a save error to the editor.
 */
async function revalidatePublicSite(slugs: Array<string | undefined | null>) {
  const siteUrl = process.env.PUBLIC_SITE_URL
  const secret = process.env.REVALIDATE_SECRET

  if (!siteUrl || !secret) return

  const unique = Array.from(new Set(slugs.filter(Boolean) as string[]))

  try {
    await fetch(`${siteUrl.replace(/\/$/, '')}/api/revalidate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-revalidate-secret': secret,
      },
      body: JSON.stringify({ slugs: unique }),
    })
  } catch (err) {
    console.error('BLOG REVALIDATE ERROR', err)
  }
}

export const Posts: CollectionConfig = {
  slug: 'posts',

  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'author', 'status', 'publishedDate', 'updatedAt'],
    components: {
      beforeListTable: ['@/components/ViewAllBlogsButton#default'],
      edit: {
        beforeDocumentControls: ['@/components/ViewOnSiteButton#default'],
      },
    },
  },

  hooks: {
    beforeChange: [
      async ({ data, operation, req, originalDoc }) => {
        const user = req.user as any

        if (operation === 'create' && user?.id) {
          data.author = user.id
        }

        if (data.status === 'published' && !data.publishedDate) {
          data.publishedDate = new Date().toISOString()
        }

        // Once a post has been published its slug is its public URL, so it is
        // frozen. Regenerating it on every title edit used to break inbound
        // links and search rankings with no redirect left behind.
        const alreadyPublished = originalDoc?.status === 'published' && Boolean(originalDoc?.slug)

        if (alreadyPublished) {
          data.slug = originalDoc.slug
          return data
        }

        const title = data.title ?? originalDoc?.title

        if (title) {
          // Titles with no Latin characters (Hindi, Arabic, Chinese) slugify to
          // an empty string, which would fail the `required` validation.
          const base = slugify(title) || fallbackSlug()

          // `slug` is unique; without this the second post whose title
          // normalises to the same value fails on a raw database constraint.
          data.slug = await uniqueSlug(base, async (candidate) => {
            const existing = await req.payload.find({
              collection: 'posts',
              where: { slug: { equals: candidate } },
              limit: 1,
              depth: 0,
              overrideAccess: true,
              pagination: false,
            })

            return existing.docs.some((doc: any) => doc.id !== originalDoc?.id)
          })
        }

        return data
      },
    ],

    // The public site caches blog pages, so tell it to rebuild them whenever a
    // post changes. Without this an edit would not appear until the cache
    // window expired.
    afterChange: [
      async ({ doc, previousDoc }) => {
        await revalidatePublicSite([doc?.slug, previousDoc?.slug])
      },
    ],

    afterDelete: [
      async ({ doc }) => {
        await revalidatePublicSite([doc?.slug])
      },
    ],
  },

  access: {
    read: ({ req }) => {
      const user = req.user as any

      // Public visitors can see only published posts
      if (!user) {
        return publishedOnly
      }

      // Admin and master admin can see all posts
      if (isAdminOrMaster(user)) {
        return true
      }

      // Normal users can see only their own posts
      const ownPostsOnly: Where = {
        author: {
          equals: user.id,
        },
      }

      return ownPostsOnly
    },

    create: ({ req }) => {
      const user = req.user as any

      // Any logged-in approved user can create posts
      return Boolean(user)
    },

    update: ({ req }) => {
      const user = req.user as any

      if (!user) return false

      // Admin and master admin can update all posts
      if (isAdminOrMaster(user)) {
        return true
      }

      // Normal users can update only their own posts
      const ownPostsOnly: Where = {
        author: {
          equals: user.id,
        },
      }

      return ownPostsOnly
    },

    delete: ({ req }) => {
      const user = req.user as any

      if (!user) return false

      // Admin and master admin can delete all posts
      if (isAdminOrMaster(user)) {
        return true
      }

      // Normal users can delete only their own posts
      const ownPostsOnly: Where = {
        author: {
          equals: user.id,
        },
      }

      return ownPostsOnly
    },
  },

  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },

    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        readOnly: true,
        description: 'Auto-generated from title.',
      },
    },

    {
      name: 'excerpt',
      type: 'textarea',
      admin: {
        description: 'Short summary shown on blog cards and blog detail page.',
      },
    },

    {
      name: 'content',
      type: 'richText',
    },

    {
      name: 'featuredImage',
      type: 'upload',
      relationTo: 'media',
    },

    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },

    {
      name: 'publishedDate',
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    },

    {
      name: 'status',
      type: 'select',
      defaultValue: 'draft',
      options: [
        {
          label: 'Draft',
          value: 'draft',
        },
        {
          label: 'Published',
          value: 'published',
        },
      ],
      admin: {
        position: 'sidebar',
      },
    },

    {
      name: 'category',
      type: 'text',
      admin: {
        position: 'sidebar',
      },
    },

    {
      name: 'tags',
      type: 'array',
      admin: {
        position: 'sidebar',
      },
      fields: [
        {
          name: 'tag',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      name: 'featured',
      type: 'checkbox',
      defaultValue: false,
      label: 'Mark as Featured',
      admin: {
        description: 'Featured post appears highlighted on the blog page.',
        position: 'sidebar',
      },
      access: {
        // Anyone can read.
        read: () => true,
        // Featuring a post promotes it into the site's highlight slot, so it is
        // an editorial decision reserved for admins. Previously every branch of
        // these checks returned true, letting any author feature their own post.
        create: ({ req }) => isAdminOrMaster(req.user),
        update: ({ req }) => isAdminOrMaster(req.user),
      },
    },
  ],
}

export default Posts
