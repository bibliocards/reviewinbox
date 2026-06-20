import { relations } from 'drizzle-orm'

import { apps } from './app-schema'
import { organization } from './auth-schema'
import { replyDrafts } from './reply-draft-schema'
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
  syncRuns: many(syncRuns),
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

export const reviewRelations = relations(reviews, ({ one }) => ({
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
}))

export const replyDraftRelations = relations(replyDrafts, ({ one }) => ({
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
