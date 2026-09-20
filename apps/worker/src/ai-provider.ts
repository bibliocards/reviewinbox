import {
  createOpenAiCompatibleReplyDraftProvider,
  type OpenAiCompatibleReplyDraftProviderOptions,
} from '@reviewinbox/ai'
import type { ReplyDraftProvider } from '@reviewinbox/ai'
import type { AiConfig } from '@reviewinbox/config'

export function createWorkerReplyDraftProvider(config: AiConfig): ReplyDraftProvider | null {
  switch (config.provider) {
    case 'disabled':
      return null
    case 'openai-compatible':
      return createConfiguredProvider(config)
    case 'managed':
      if (config.deploymentMode !== 'cloud') {
        throw new Error('Managed AI provider is only available in cloud deployments.')
      }
      return createConfiguredProvider(config)
    default:
      throw new Error('Unsupported AI provider.')
  }
}

function createConfiguredProvider(config: AiConfig): ReplyDraftProvider {
  const options: OpenAiCompatibleReplyDraftProviderOptions = {
    apiKey: requireAiConfigValue(config.apiKey, 'AI_API_KEY'),
    model: requireAiConfigValue(config.model, 'AI_MODEL'),
  }
  if (config.baseUrl !== undefined && config.baseUrl.length > 0) {
    options.baseUrl = config.baseUrl
  }
  return createOpenAiCompatibleReplyDraftProvider(options)
}

function requireAiConfigValue(value: string | undefined, name: string): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required for the configured AI provider.`)
  }

  return value
}
