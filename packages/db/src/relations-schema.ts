import { relations } from 'drizzle-orm'

import { apps } from './app-schema'
import { organization } from './auth-schema'
import { usageEvents } from './billing-schema'
import { replyDrafts } from './reply-draft-schema'
import { publishedReplies, replyAuditEvents } from './reply-publishing-schema'
import { reviews } from './review-schema'
import { storeConnections, storeCredentials } from './store-schema'
import { syncRuns } from './sync-run-schema'

export const appRelations = relations(apps, ({ one, many }) => ({
  organization: one(organization, {
    fields: [apps.organizationId],
    references: [organization.id],
  }),
  storeConnections: many(storeConnections),
  reviews: many(reviews),
  replyDrafts: many(replyDrafts),
  publishedReplies: many(publishedReplies),
  replyAuditEvents: many(replyAuditEvents),
  syncRuns: many(syncRuns),
}))

export const usageEventRelations = relations(usageEvents, ({ one }) => ({
  organization: one(organization, {
    fields: [usageEvents.organizationId],
    references: [organization.id],
  }),
}))

export const storeConnectionRelations = relations(storeConnections, ({ one, many }) => ({
  organization: one(organization, {
    fields: [storeConnections.organizationId],
    references: [organization.id],
  }),
  app: one(apps, {
    fields: [storeConnections.appId],
    references: [apps.id],
  }),
  credential: one(storeCredentials, {
    fields: [storeConnections.id],
    references: [storeCredentials.storeConnectionId],
  }),
  reviews: many(reviews),
  syncRuns: many(syncRuns),
}))

export const storeCredentialRelations = relations(storeCredentials, ({ one }) => ({
  storeConnection: one(storeConnections, {
    fields: [storeCredentials.storeConnectionId],
    references: [storeConnections.id],
  }),
}))

export const reviewRelations = relations(reviews, ({ one, many }) => ({
  organization: one(organization, {
    fields: [reviews.organizationId],
    references: [organization.id],
  }),
  app: one(apps, {
    fields: [reviews.appId],
    references: [apps.id],
  }),
  storeConnection: one(storeConnections, {
    fields: [reviews.storeConnectionId],
    references: [storeConnections.id],
  }),
  replyDraft: one(replyDrafts, {
    fields: [reviews.id],
    references: [replyDrafts.reviewId],
  }),
  publishedReply: one(publishedReplies, {
    fields: [reviews.id],
    references: [publishedReplies.reviewId],
  }),
  auditEvents: many(replyAuditEvents),
}))

export const replyDraftRelations = relations(replyDrafts, ({ one, many }) => ({
  organization: one(organization, {
    fields: [replyDrafts.organizationId],
    references: [organization.id],
  }),
  app: one(apps, {
    fields: [replyDrafts.appId],
    references: [apps.id],
  }),
  review: one(reviews, {
    fields: [replyDrafts.reviewId],
    references: [reviews.id],
  }),
  publishedReplies: many(publishedReplies),
}))

export const publishedReplyRelations = relations(publishedReplies, ({ one }) => ({
  organization: one(organization, {
    fields: [publishedReplies.organizationId],
    references: [organization.id],
  }),
  app: one(apps, {
    fields: [publishedReplies.appId],
    references: [apps.id],
  }),
  storeConnection: one(storeConnections, {
    fields: [publishedReplies.storeConnectionId],
    references: [storeConnections.id],
  }),
  review: one(reviews, {
    fields: [publishedReplies.reviewId],
    references: [reviews.id],
  }),
  replyDraft: one(replyDrafts, {
    fields: [publishedReplies.replyDraftId],
    references: [replyDrafts.id],
  }),
}))

export const replyAuditEventRelations = relations(replyAuditEvents, ({ one }) => ({
  organization: one(organization, {
    fields: [replyAuditEvents.organizationId],
    references: [organization.id],
  }),
  app: one(apps, {
    fields: [replyAuditEvents.appId],
    references: [apps.id],
  }),
  review: one(reviews, {
    fields: [replyAuditEvents.reviewId],
    references: [reviews.id],
  }),
}))

export const syncRunRelations = relations(syncRuns, ({ one }) => ({
  organization: one(organization, {
    fields: [syncRuns.organizationId],
    references: [organization.id],
  }),
  app: one(apps, {
    fields: [syncRuns.appId],
    references: [apps.id],
  }),
  storeConnection: one(storeConnections, {
    fields: [syncRuns.storeConnectionId],
    references: [storeConnections.id],
  }),
}))
