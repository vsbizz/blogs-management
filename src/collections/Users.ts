import type { CollectionConfig, Where } from 'payload'
import crypto from 'crypto'
import { APIError } from 'payload'

const isMasterAdmin = (user: any) => user?.role === 'master-admin'
const isAdmin = (user: any) => user?.role === 'admin'
const isUser = (user: any) => user?.role === 'user'

/**
 * Rows an admin may modify: everyone except master-admins and themselves.
 * Self is excluded so an admin cannot change their own role or delete
 * their own account through the users list.
 */
const nonMasterUsersOnly = (currentUserId?: string | number): Where => {
  if (currentUserId) {
    return {
      and: [{ role: { not_equals: 'master-admin' } }, { id: { not_equals: currentUserId } }],
    }
  }
  return { role: { not_equals: 'master-admin' } }
}

/**
 * Rows an admin may read: the same set as above, plus their own record.
 * Reading self must stay allowed or `/api/users/me` and the account screens
 * break.
 */
const readableByAdmin = (currentUserId?: string | number): Where => {
  if (currentUserId) {
    return {
      or: [{ role: { not_equals: 'master-admin' } }, { id: { equals: currentUserId } }],
    }
  }
  return { role: { not_equals: 'master-admin' } }
}

const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  versions: false,

  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'role', 'status', 'rowActions'],

    hidden: ({ user }) => {
      const loggedInUser = user as any
      return isUser(loggedInUser)
    },
    baseListFilter: ({ req }) => {
      const user = req.user as any
      if (!user) return null

      if (user.role === 'master-admin') {
        return { id: { not_equals: user.id } } as Where
      }

      if (user.role === 'admin') {
        return {
          and: [{ role: { not_equals: 'master-admin' } }, { id: { not_equals: user.id } }],
        } as Where
      }

      return { id: { equals: '__never_match__' } } as Where
    },

    components: {
      // ── IMPORTANT: Register both components here ──────────────────────────
      // AdminTransferDeleteModal: renders the transfer-before-delete modal for admins
      // DeleteAccountLink: shows "Delete my account" link in nav for all roles
      beforeListTable: [
        '@/components/UserApprovalNotifications#default',
        '@/components/AdminDeleteUsers#default',
      ],
    },
  },

  hooks: {
    afterRead: [
      async ({ doc }) => {
        doc.roleDisplay = doc.role
        doc.statusDisplay = doc.status
        return doc
      },
    ],

    beforeChange: [
      async ({ data, operation, req }) => {
        const currentUser = req.user as any

        if (operation === 'create') {
          const usersCount = await req.payload.count({ collection: 'users' })

          if (usersCount.totalDocs === 0) {
            data.role = 'master-admin'
            data.status = 'approved'
          } else if (isMasterAdmin(currentUser)) {
            data.role = data.role || 'user'
            data.status = data.status || 'approved'
          } else if (isAdmin(currentUser)) {
            data.role = 'user'
            data.status = 'approved'
          } else {
            data.role = 'user'
            data.status = 'pending'
            data.approvalToken = crypto.randomBytes(32).toString('hex')
            data.approvalTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          }
        }

        data.roleDisplay = data.role
        data.statusDisplay = data.status

        return data
      },
    ],

    beforeLogin: [
      async ({ user }) => {
        if (user.status === 'pending') {
          throw new APIError(
            'Your account is pending approval. Please wait for admin approval.',
            401,
            undefined,
            true,
          )
        }
        if (user.status === 'rejected') {
          throw new APIError(
            'Your account has been rejected. Please contact the administrator.',
            401,
            undefined,
            true,
          )
        }
      },
    ],

    afterChange: [
      async ({ doc, previousDoc, req, operation }) => {
        const currentUser = req.user as any
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
        const loginUrl = `${siteUrl}/admin/login`

        // CASE 1: Admin creates user from admin panel
        if (
          operation === 'create' &&
          currentUser &&
          (currentUser.role === 'admin' || currentUser.role === 'master-admin') &&
          doc.status === 'approved'
        ) {
          try {
            await req.payload.sendEmail({
              to: doc.email,
              subject: 'Your Blog CMS Account Has Been Created',
              html: `
                <div style="font-family:Arial,sans-serif;background:#f4f6f8;padding:24px;">
                  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
                    <div style="background:#111827;padding:20px;text-align:center;">
                      <h2 style="margin:0;color:#ffffff;">Account Created</h2>
                    </div>
                    <div style="padding:24px;color:#333;">
                      <p>Hello ${doc.name || 'User'},</p>
                      <p>Your account has been created on <strong>Blog CMS</strong> by <strong>${currentUser.name || currentUser.email || 'Administrator'}</strong>.</p>
                      <p>You can now login using: <strong>${doc.email}</strong></p>
                      <div style="text-align:center;margin-top:24px;">
                        <a href="${loginUrl}" style="display:inline-block;padding:12px 20px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">Login to Your Account</a>
                      </div>
                    </div>
                  </div>
                </div>
              `,
            })
          } catch (err) {
            console.error('ADMIN CREATED USER EMAIL ERROR ❌', err)
          }
        }

        // CASE 2: Public signup → pending
        if (operation === 'create' && doc.status === 'pending') {
          const approveLink = `${siteUrl}/api/users/approve?id=${doc.id}&action=approve&token=${doc.approvalToken}`
          const rejectLink = `${siteUrl}/api/users/approve?id=${doc.id}&action=reject&token=${doc.approvalToken}`

          try {
            await req.payload.create({
              collection: 'user-approvals',
              data: {
                userId: Number(doc.id),
                name: doc.name || 'No Name',
                email: doc.email,
                status: 'pending',
              },
              overrideAccess: true,
            })
          } catch (err) {
            console.error('USER APPROVAL CREATE ERROR ❌', err)
          }

          try {
            const admins = await req.payload.find({
              collection: 'users',
              where: { role: { in: ['master-admin', 'admin'] } },
              overrideAccess: true,
              limit: 50,
            })
            const adminEmails = admins.docs.map((a: any) => a.email)

            await req.payload.sendEmail({
              to: adminEmails,
              subject: 'New User Signup Approval Required',
              html: `
                <div style="font-family:Arial,sans-serif;background:#f4f6f8;padding:24px;">
                  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
                    <div style="background:#111827;padding:20px;text-align:center;">
                      <h2 style="margin:0;color:#ffffff;">New User Signup</h2>
                    </div>
                    <div style="padding:24px;color:#333;">
                      <p>Hello Admin,</p>
                      <p>A new user has requested access to <strong>Blog CMS</strong>.</p>
                      <div style="background:#f9fafb;padding:14px;border-radius:8px;border:1px solid #e5e7eb;">
                        <p style="margin:0 0 8px;"><strong>Name:</strong> ${doc.name || 'No Name'}</p>
                        <p style="margin:0;"><strong>Email:</strong> ${doc.email}</p>
                      </div>
                      <div style="text-align:center;margin-top:24px;">
                        <a href="${approveLink}" style="display:inline-block;padding:12px 20px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;margin-right:8px;">Approve User</a>
                        <a href="${rejectLink}" style="display:inline-block;padding:12px 20px;background:#dc2626;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">Reject User</a>
                      </div>
                    </div>
                  </div>
                </div>
              `,
            })
          } catch (err) {
            console.error('ADMIN EMAIL ERROR ❌', err)
          }
        }

        // CASE 3: Status changed to approved
        if (
          operation !== 'create' &&
          doc.status === 'approved' &&
          previousDoc?.status !== 'approved'
        ) {
          try {
            await req.payload.sendEmail({
              to: doc.email,
              subject: 'Account Approved',
              html: `
                <div style="font-family:Arial,sans-serif;background:#f4f6f8;padding:24px;">
                  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
                    <div style="background:#16a34a;padding:20px;text-align:center;">
                      <h2 style="margin:0;color:#ffffff;">Account Approved</h2>
                    </div>
                    <div style="padding:24px;color:#333;">
                      <p>Hello ${doc.name || 'User'},</p>
                      <p>Your account on <strong>Blog CMS</strong> has been approved. You can now login using: <strong>${doc.email}</strong></p>
                      <div style="text-align:center;margin-top:24px;">
                        <a href="${loginUrl}" style="display:inline-block;padding:12px 20px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">Login to Your Account</a>
                      </div>
                    </div>
                  </div>
                </div>
              `,
            })
          } catch (err) {
            console.error('APPROVED EMAIL ERROR ❌', err)
          }
        }

        // CASE 4: Status changed to rejected
        if (
          operation !== 'create' &&
          doc.status === 'rejected' &&
          previousDoc?.status !== 'rejected'
        ) {
          try {
            await req.payload.sendEmail({
              to: doc.email,
              subject: 'Account Rejected',
              html: `
                <div style="font-family:Arial,sans-serif;background:#f4f6f8;padding:24px;">
                  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
                    <div style="background:#dc2626;padding:20px;text-align:center;">
                      <h2 style="margin:0;color:#ffffff;">Account Rejected</h2>
                    </div>
                    <div style="padding:24px;color:#333;">
                      <p>Hello ${doc.name || 'User'},</p>
                      <p>Your account request for <strong>Blog CMS</strong> has been rejected. Contact the administrator if you think this is a mistake.</p>
                    </div>
                  </div>
                </div>
              `,
            })
          } catch (err) {
            console.error('REJECTED EMAIL ERROR ❌', err)
          }
        }
      },
    ],

    afterDelete: [
      async ({ doc, req }) => {
        // ── SIMPLIFIED: No ghost user, no context-passing complexity ──────────
        // Blog transfer is handled BEFORE deletion:
        //   - Self-delete: by /api/users/delete-account route (transfers then deletes)
        //   - Admin-delete: by AdminTransferDeleteModal component (transfers then calls DELETE /api/users/:id)
        //
        // This hook now only cleans up UserApprovals for the deleted user
        try {
          const approvals = await req.payload.find({
            collection: 'user-approvals',
            where: {
              and: [{ userId: { equals: doc.id } }, { status: { equals: 'pending' } }],
            },
            overrideAccess: true,
            limit: 100,
          })

          for (const approval of approvals.docs) {
            await req.payload.delete({
              collection: 'user-approvals',
              id: approval.id,
              overrideAccess: true,
            })
          }
        } catch (err) {
          console.error('afterDelete cleanup error:', err)
        }
      },
    ],
  },

  access: {
    create: ({ req }) => {
      const user = req.user as any
      if (!user) return true
      if (isMasterAdmin(user)) return true
      if (isAdmin(user)) return true
      return false
    },

    read: ({ req }) => {
      const user = req.user as any
      if (!user) return false
      if (isMasterAdmin(user)) return true
      // Admins manage contributors, not each other. This used to return `true`,
      // which let one admin read every account including master-admins even
      // though `update` already excluded them. `baseListFilter` hid those rows
      // in the UI but the REST API still returned them.
      if (isAdmin(user)) return readableByAdmin(user.id)
      return { id: { equals: user.id } } as Where
    },

    update: ({ req }) => {
      const user = req.user as any
      if (!user) return false
      if (isMasterAdmin(user)) return true
      if (isAdmin(user)) return nonMasterUsersOnly(user.id)
      return { id: { equals: user.id } } as Where
    },

    delete: ({ req }) => {
      const user = req.user as any
      if (!user) return false
      if (isMasterAdmin(user)) return true
      if (isAdmin(user)) return nonMasterUsersOnly(user.id)
      return false
    },
  },

  fields: [
    {
      name: 'email',
      type: 'email',
      required: true,
      access: { update: () => false },
    },
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: { position: 'sidebar' },
    },
    {
      // Virtual column that renders the row Delete action. Nothing is stored;
      // it exists so the button gets its own column instead of being injected
      // into the last cell, which put it inside Status.
      name: 'rowActions',
      type: 'ui',
      label: 'Actions',
      admin: {
        components: {
          Cell: '@/components/UserRowActions#default',
        },
      },
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'user',
      options: [
        { label: 'Master Admin', value: 'master-admin' },
        { label: 'Admin', value: 'admin' },
        { label: 'User', value: 'user' },
      ],
      admin: {
        position: 'sidebar',
        condition: (data, __, { user }) => {
          const loggedInUser = user as any
          if (loggedInUser?.role !== 'master-admin') return false
          return String(loggedInUser?.id) !== String(data?.id)
        },
      },
      access: {
        create: ({ req }) => (req.user as any)?.role === 'master-admin',
        update: ({ req, id }) => {
          const user = req.user as any
          if (!user) return false
          if (String(user.id) === String(id)) return false
          return user.role === 'master-admin'
        },
      },
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'pending',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Approved', value: 'approved' },
        { label: 'Rejected', value: 'rejected' },
      ],
      admin: {
        position: 'sidebar',
        condition: (data, __, { user }) => {
          const loggedInUser = user as any
          if (loggedInUser?.role !== 'master-admin') return false
          return String(loggedInUser?.id) !== String(data?.id)
        },
      },
      access: {
        create: ({ req }) => (req.user as any)?.role === 'master-admin',
        update: ({ req, id }) => {
          const user = req.user as any
          if (!user) return false
          if (String(user.id) === String(id)) return false
          return user.role === 'master-admin'
        },
      },
    },
    {
      name: 'roleDisplay',
      type: 'text',
      label: 'Role',
      admin: {
        position: 'sidebar',
        readOnly: true,
        condition: (data, __, { user }) => {
          const loggedInUser = user as any
          return String(loggedInUser?.id) === String(data?.id)
        },
      },
      access: { create: () => false, update: () => false },
    },
    {
      name: 'statusDisplay',
      type: 'text',
      label: 'Status',
      admin: {
        position: 'sidebar',
        readOnly: true,
        condition: (data, __, { user }) => {
          const loggedInUser = user as any
          return String(loggedInUser?.id) === String(data?.id)
        },
      },
      access: { create: () => false, update: () => false },
    },
    {
      name: 'approvalToken',
      type: 'text',
      admin: { hidden: true },
    },
    {
      name: 'approvalTokenExpiry',
      type: 'date',
      admin: { hidden: true },
    },
    {
      name: 'deleteUserAction',
      type: 'ui',
      admin: {},
    },
  ],
}

export default Users
