import { AiDraftingError } from './errors'
import { chooseReplyLanguage } from './language-policy'
import { parseReplyDraftOutput, replyDraftOutputSchema } from './output-schema'
import { buildReplyDraftPrompt, buildReplyDraftSystemPrompt, replyDraftPromptVersion } from './prompts/reply-draft-v1'
import type { ReplyDraftProvider } from './provider'
import { getStoreReplyDraftLimit } from './store-reply-limits'

const maxReplyContextLength = 4000
const maxReviewTextLength = 8000
const maxReviewTitleLength = 500
const maxAppNameLength = 200
const maxLanguageTagLength = 35
const maxMappedLanguages = 50
const maxStoreLocaleLength = 64

export type GenerateReplyDraftInput = {
  reviewText: string
  reviewRating: number | null
  reviewTitle?: string | null
  appName: string
  store: 'apple_app_store' | 'google_play'
  replyContext?: string | null
  defaultLanguage: string
  mappedLanguages: string[]
  storeLocale?: string | null
}

export type GenerateReplyDraftOptions = {
  provider: ReplyDraftProvider
}

export type GenerateReplyDraftResult = {
  draftText: string
  detectedReviewLanguage: string | null
  chosenReplyLanguage: string
  model: string
  promptVersion: string
}

export async function generateReplyDraft(
  input: GenerateReplyDraftInput,
  options: GenerateReplyDraftOptions,
): Promise<GenerateReplyDraftResult> {
  validateInputSize(input)

  const reviewText = input.reviewText.trim()
  if (!reviewText) {
    throw new AiDraftingError('safety_rejected', 'Cannot generate a reply draft for a review without text.')
  }

  const storeLimit = getStoreReplyDraftLimit(input.store)

  const providerResult = await options.provider.generateReplyDraftCompletion({
    system: buildReplyDraftSystemPrompt(),
    prompt: buildReplyDraftPrompt(input, storeLimit.maxCharacters),
    schema: replyDraftOutputSchema,
    temperature: 0.3,
    maxOutputTokens: storeLimit.maxOutputTokens,
  })

  try {
    const parsed = parseReplyDraftOutput(providerResult.output, storeLimit.maxCharacters)
    const detectedReviewLanguage = parsed.detectedReviewLanguage

    return {
      draftText: parsed.draftText,
      detectedReviewLanguage,
      chosenReplyLanguage: chooseReplyLanguage(
        { defaultLanguage: input.defaultLanguage, mappedLanguages: input.mappedLanguages },
        detectedReviewLanguage,
      ),
      model: providerResult.model,
      promptVersion: replyDraftPromptVersion,
    }
  } catch (error) {
    throw new AiDraftingError('invalid_model_output', 'AI provider returned invalid Reply Draft output.', { cause: error })
  }
}

function validateInputSize(input: GenerateReplyDraftInput): void {
  if (input.reviewText.length > maxReviewTextLength) {
    throw new AiDraftingError('context_too_large', 'Review text exceeds the 8000 character limit.')
  }

  if ((input.reviewTitle?.length ?? 0) > maxReviewTitleLength) {
    throw new AiDraftingError('context_too_large', 'Review title exceeds the 500 character limit.')
  }

  if (input.appName.length > maxAppNameLength) {
    throw new AiDraftingError('context_too_large', 'App name exceeds the 200 character limit.')
  }

  if ((input.replyContext?.length ?? 0) > maxReplyContextLength) {
    throw new AiDraftingError('context_too_large', 'Reply Context exceeds the 4000 character limit.')
  }

  if (input.defaultLanguage.length > maxLanguageTagLength) {
    throw new AiDraftingError('invalid_provider_config', 'Default language exceeds the 35 character limit.')
  }

  if (input.mappedLanguages.length > maxMappedLanguages) {
    throw new AiDraftingError('invalid_provider_config', 'Reply Language Policy has too many mapped languages.')
  }

  if (input.mappedLanguages.some((language) => language.length > maxLanguageTagLength)) {
    throw new AiDraftingError('invalid_provider_config', 'Mapped language exceeds the 35 character limit.')
  }

  if ((input.storeLocale?.length ?? 0) > maxStoreLocaleLength) {
    throw new AiDraftingError('context_too_large', 'Store locale exceeds the 64 character limit.')
  }
}
