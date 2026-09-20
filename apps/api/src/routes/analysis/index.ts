import { loadAiConfig, loadTypeSafeConfig } from '@reviewinbox/config'
import { Hono } from 'hono'

import {
  requireActiveOrganizationManagerSession,
  requireActiveOrganizationSession,
} from '../../auth/session'
import { database } from '../../db'
import { getAnalysis, getAnalysisReview } from './dashboard'
import { deleteOverride, putOverride } from './overrides'
import { createTopic } from './topic-create'
import { listTopics, mergeTopic, requestDiscovery, updateTopic } from './topics'
type Database = typeof database

export type AnalysisRouteDependencies = {
  database: Database
  requireSession: typeof requireActiveOrganizationSession
  requireManagerSession: typeof requireActiveOrganizationManagerSession
  discoveryEnabled: () => boolean
}

const defaultDependencies: AnalysisRouteDependencies = {
  database,
  requireSession: requireActiveOrganizationSession,
  requireManagerSession: requireActiveOrganizationManagerSession,
  discoveryEnabled: defaultDiscoveryEnabled,
}

export function createAnalysisRoutes(overrides: Partial<AnalysisRouteDependencies> = {}): Hono {
  const dependencies = { ...defaultDependencies, ...overrides }
  const routes = new Hono()

  routes.get('/api/analysis', (context) => getAnalysis(context, dependencies))
  routes.get('/api/analysis/reviews/:reviewId', (context) =>
    getAnalysisReview(context, dependencies),
  )
  routes.put('/api/analysis/reviews/:reviewId/override', (context) =>
    putOverride(context, dependencies),
  )
  routes.delete('/api/analysis/reviews/:reviewId/override', (context) =>
    deleteOverride(context, dependencies),
  )

  routes.get('/api/apps/:appId/topics', (context) => listTopics(context, dependencies))
  routes.post('/api/apps/:appId/topics/discover', (context) =>
    requestDiscovery(context, dependencies),
  )
  routes.post('/api/apps/:appId/topics', (context) => createTopic(context, dependencies))
  routes.patch('/api/apps/:appId/topics/:topicId', (context) => updateTopic(context, dependencies))
  routes.post('/api/apps/:appId/topics/:topicId/merge', (context) =>
    mergeTopic(context, dependencies),
  )

  return routes
}

export const analysisRoutes = createAnalysisRoutes()

function defaultDiscoveryEnabled(): boolean {
  try {
    return loadTypeSafeConfig().apiKey !== undefined && loadAiConfig().provider !== 'disabled'
  } catch {
    return false
  }
}
