import { relations } from "drizzle-orm"

import { apps } from "./app-schema"
import { organization } from "./auth-schema"
import { reviews } from "./review-schema"
import { storeConnections, storeCredentials } from "./store-schema"
import { syncRuns } from "./sync-run-schema"

export const appRelations = relations(apps, ({ one, many }) => ({
  organization: one(organization, {
    fields: [apps.organizationId],
    references: [organization.id],
  }),
  storeConnections: many(storeConnections),
  reviews: many(reviews),
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
