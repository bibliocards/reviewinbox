import { createOpenAiCompatibleReplyDraftProvider } from '@reviewinbox/ai'
import type { ReplyDraftProvider } from '@reviewinbox/ai'
import type { AiConfig } from '@reviewinbox/config'

export function createWorkerReplyDraftProvider(config: AiConfig): ReplyDraftProvider | null {
  switch (config.provider) {
    case 'disabled':
      return null
    case 'openai-compatible':
      return createOpenAiCompatibleReplyDraftProvider({
        apiKey: requireAiConfigValue(config.apiKey, 'AI_API_KEY'),
        model: requireAiConfigValue(config.model, 'AI_MODEL'),
        ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
      })
    case 'managed':
      throw new Error('Managed AI provider runtime is not configured in this deployment.')
  }
}

function requireAiConfigValue(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required for the configured AI provider.`)
  }

  return value
}
