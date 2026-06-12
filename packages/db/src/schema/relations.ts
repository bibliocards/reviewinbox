import { relations } from "drizzle-orm"

import { app } from "./apps.js"
import { organization } from "./auth.js"
import { review } from "./reviews.js"
import { storeConnection } from "./store-connections.js"
import { storeCredential } from "./store-credentials.js"
import { syncRun } from "./sync-runs.js"

export const organizationRelations = relations(organization, ({ many }) => ({
  apps: many(app),
  storeConnections: many(storeConnection),
  reviews: many(review),
  syncRuns: many(syncRun),
}))

export const appRelations = relations(app, ({ one, many }) => ({
  organization: one(organization, {
    fields: [app.organizationId],
    references: [organization.id],
  }),
  storeConnections: many(storeConnection),
  reviews: many(review),
  syncRuns: many(syncRun),
}))

export const storeConnectionRelations = relations(storeConnection, ({ one, many }) => ({
  organization: one(organization, {
    fields: [storeConnection.organizationId],
    references: [organization.id],
  }),
  app: one(app, {
    fields: [storeConnection.appId],
    references: [app.id],
  }),
  credentials: many(storeCredential),
  reviews: many(review),
  syncRuns: many(syncRun),
}))

export const storeCredentialRelations = relations(storeCredential, ({ one }) => ({
  organization: one(organization, {
    fields: [storeCredential.organizationId],
    references: [organization.id],
  }),
  app: one(app, {
    fields: [storeCredential.appId],
    references: [app.id],
  }),
  storeConnection: one(storeConnection, {
    fields: [storeCredential.storeConnectionId],
    references: [storeConnection.id],
  }),
}))

export const reviewRelations = relations(review, ({ one }) => ({
  organization: one(organization, {
    fields: [review.organizationId],
    references: [organization.id],
  }),
  app: one(app, {
    fields: [review.appId],
    references: [app.id],
  }),
  storeConnection: one(storeConnection, {
    fields: [review.storeConnectionId],
    references: [storeConnection.id],
  }),
}))

export const syncRunRelations = relations(syncRun, ({ one }) => ({
  organization: one(organization, {
    fields: [syncRun.organizationId],
    references: [organization.id],
  }),
  app: one(app, {
    fields: [syncRun.appId],
    references: [app.id],
  }),
  storeConnection: one(storeConnection, {
    fields: [syncRun.storeConnectionId],
    references: [storeConnection.id],
  }),
}))
