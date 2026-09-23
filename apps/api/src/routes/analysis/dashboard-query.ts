import { reviewAnalysisCriteriaVersion } from '@reviewinbox/ai'
import { analysisResponseSchema, type AnalysisFilters } from '@reviewinbox/contracts'
import { type Database } from '@reviewinbox/db'
import { sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'

const summarySchema = analysisResponseSchema
  .pick({
    total: true,
    analyzed: true,
    severities: true,
    topics: true,
    trend: true,
    versions: true,
  })
  .extend({ reviewIds: z.array(z.uuid()) })

function sourceConditions(organizationId: string, filters: AnalysisFilters): SQL {
  const conditions = [sql`r.organization_id = ${organizationId}`]
  if (filters.appId !== undefined) {
    conditions.push(sql`r.app_id = ${filters.appId}::uuid`)
  }
  if (filters.from !== undefined) {
    conditions.push(sql`r.reviewed_at >= ${filters.from}::timestamp`)
  }
  if (filters.to !== undefined) {
    conditions.push(sql`r.reviewed_at <= ${filters.to}::timestamp`)
  }
  if (filters.provider !== undefined) {
    conditions.push(sql`s.provider = ${filters.provider}`)
  }
  if (filters.version !== undefined) {
    conditions.push(sql`r.version = ${filters.version}`)
  }
  return sql.join(conditions, sql` and `)
}

function versionConditions(organizationId: string, filters: AnalysisFilters): SQL {
  if (filters.appId === undefined) {
    return sql`false`
  }
  const conditions = [
    sql`r.organization_id = ${organizationId}`,
    sql`r.app_id = ${filters.appId}::uuid`,
  ]
  if (filters.provider !== undefined) {
    conditions.push(sql`s.provider = ${filters.provider}`)
  }
  return sql.join(conditions, sql` and `)
}

function classificationConditions(filters: AnalysisFilters): SQL {
  const conditions: SQL[] = [sql`true`]
  if (filters.severity !== undefined) {
    conditions.push(
      filters.severity === 'unknown' ? sql`severity is null` : sql`severity = ${filters.severity}`,
    )
  }
  if (filters.intent !== undefined) {
    conditions.push(sql`intents ? ${filters.intent}`)
  }
  if (filters.topicId !== undefined) {
    conditions.push(sql`${filters.topicId}::uuid = any(topic_ids)`)
  }
  if (filters.topicStatus !== undefined) {
    conditions.push(
      sql`exists (select 1 from review_topics t where t.id = any(topic_ids) and t.status = ${filters.topicStatus})`,
    )
  }
  return sql.join(conditions, sql` and `)
}

function effectiveReviews(organizationId: string, filters: AnalysisFilters): SQL {
  const currentAnalysis = sql`r.analysis_status = 'completed'
    and a.criteria_version = ${reviewAnalysisCriteriaVersion}`
  return sql`source as (
    select r.id, r.body, r.reviewed_at, (${currentAnalysis}) as analysis_current, s.provider, r.version,
      case when a.manual_override is not null then a.manual_override->>'severity'
        when ${currentAnalysis} then a.severity else null end as severity,
      case when a.manual_override is not null then a.manual_override->'intents'
        when ${currentAnalysis} then coalesce(a.intents, '[]'::jsonb)
        else '[]'::jsonb end as intents,
      array(select t.id from review_topics t
        where t.app_id = r.app_id and t.organization_id = r.organization_id
          and t.status <> 'rejected' and t.merged_into_id is null
          and case when a.manual_override is null then (${currentAnalysis}) and exists (
            select 1 from review_topic_assignments ta where ta.review_id = r.id and ta.topic_id = t.id
          ) else (a.manual_override->'topicIds') ? t.id::text end
      ) as topic_ids
    from reviews r join apps app on app.id = r.app_id and app.organization_id = r.organization_id
    join store_connections s on s.id = r.store_connection_id
    left join review_analyses a on a.review_id = r.id
    where ${sourceConditions(organizationId, filters)}
  ), filtered as materialized (select * from source where ${classificationConditions(filters)})`
}

function topicSummary(
  organizationId: string,
  filters: AnalysisFilters,
  includeRejected: boolean,
): SQL {
  const appCondition =
    filters.appId === undefined ? sql`true` : sql`t.app_id = ${filters.appId}::uuid`
  const statusCondition = includeRejected
    ? sql`true`
    : sql`t.status <> 'rejected' and t.merged_into_id is null`
  return sql`select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'appId', t.app_id, 'label', t.label, 'description', t.description,
    'aliases', t.aliases, 'status', t.status, 'origin', t.origin, 'mergedIntoId', t.merged_into_id,
    'reviewCount', (select count(*) from filtered f where t.id = any(f.topic_ids)),
    'examples', (select coalesce(jsonb_agg(e), '[]'::jsonb) from (
      select f.id, left(f.body, 500) as body from filtered f where t.id = any(f.topic_ids)
      order by f.reviewed_at desc, f.id limit 3
    ) e)
  ) order by t.label, t.id), '[]'::jsonb)
  from review_topics t where t.organization_id = ${organizationId} and ${appCondition} and ${statusCondition}`
}

function distributionSummary(organizationId: string, filters: AnalysisFilters): SQL {
  return sql`'severities', (select coalesce(jsonb_agg(v order by array_position(
    array['critical', 'blocking', 'degraded', 'minor', 'none', 'unknown'], v.severity)), '[]'::jsonb) from (
    select coalesce(severity, 'unknown') as severity, count(*) as count from filtered group by severity
  ) v),
  'trend', (select coalesce(jsonb_agg(v order by v.date), '[]'::jsonb) from (
    select to_char(reviewed_at, 'YYYY-MM-DD') as date, count(*) as count,
      count(*) filter (where severity = 'critical') as critical,
      count(*) filter (where severity = 'blocking') as blocking
    from filtered group by to_char(reviewed_at, 'YYYY-MM-DD')
  ) v),
  'versions', (select coalesce(jsonb_agg(v order by v.provider, v.version), '[]'::jsonb) from (
    select distinct s.provider, r.version from reviews r
    join apps app on app.id = r.app_id and app.organization_id = r.organization_id
    join store_connections s on s.id = r.store_connection_id
    where ${versionConditions(organizationId, filters)} and r.version is not null
  ) v)`
}

/** Aggregate the full history in PostgreSQL; transfer only the requested Review page. */
export async function readAnalysisSummary(
  db: Database,
  organizationId: string,
  filters: AnalysisFilters,
  includeRejected = false,
) {
  const result = await db.execute(sql`with ${effectiveReviews(organizationId, filters)}
    select jsonb_build_object(
      'total', (select count(*) from filtered),
      'analyzed', (select count(*) from filtered where analysis_current),
      'reviewIds', (select coalesce(jsonb_agg(p.id), '[]'::jsonb) from (
        select id from filtered order by reviewed_at desc, id limit ${filters.pageSize}
          offset ${(filters.page - 1) * filters.pageSize}
      ) p),
      'topics', (${topicSummary(organizationId, filters, includeRejected)}),
      ${distributionSummary(organizationId, filters)}
    ) as summary`)
  return summarySchema.parse(result.rows[0]?.['summary'])
}
