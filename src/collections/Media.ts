import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    hidden: true, // hides from sidebar nav
  },
  access: {
    // Must stay public. The marketing site fetches posts anonymously with
    // depth=2, and Payload only populates a relationship the caller can read:
    // gating this returns a bare media ID instead of the image object, so every
    // featured image on the blog breaks. The exposure is limited to metadata
    // for files already served from public Cloudinary URLs.
    read: () => true,
    create: ({ req }) => !!req.user, // only logged in users can upload
    update: ({ req }) => !!req.user,
    delete: ({ req }) => {
      const user = req.user as any
      return user?.role === 'master-admin'
    },
  },

  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      admin: {
        description: 'Describes the image for screen readers and search engines.',
      },
    },
  ],

  upload: true,
}
