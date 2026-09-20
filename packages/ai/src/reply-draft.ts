import { AiDraftingError } from './errors'
import { chooseReplyLanguage } from './language-policy'
import { parseReplyDraftOutput, replyDraftOutputSchema } from './output-schema'
import {
  buildReplyDraftPrompt,
  buildReplyDraftSystemPrompt,
  replyDraftPromptVersion,
} from './prompts/reply-draft-v1'
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

export type GenerateReplyDraftOptions = { provider: ReplyDraftProvider }

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
    throw new AiDraftingError(
      'safety_rejected',
      'Cannot generate a reply draft for a review without text.',
    )
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
    const providerOutput = replyDraftOutputSchema.parse(providerResult.output)
    const parsed = parseReplyDraftOutput(providerOutput, storeLimit.maxCharacters)
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
    throw new AiDraftingError(
      'invalid_model_output',
      'AI provider returned invalid Reply Draft output.',
      { cause: error },
    )
  }
}

function validateInputSize(input: GenerateReplyDraftInput): void {
  validateContextLengths(input)
  validateLanguagePolicy(input)
}

function validateContextLengths(input: GenerateReplyDraftInput): void {
  const contextLimits: Array<readonly [string, number, number]> = [
    ['Review text', input.reviewText.length, maxReviewTextLength],
    ['Review title', input.reviewTitle?.length ?? 0, maxReviewTitleLength],
    ['App name', input.appName.length, maxAppNameLength],
    ['Reply Context', input.replyContext?.length ?? 0, maxReplyContextLength],
    ['Store locale', input.storeLocale?.length ?? 0, maxStoreLocaleLength],
  ]
  const exceeded = contextLimits.find(([, length, limit]) => length > limit)
  if (exceeded) {
    throw new AiDraftingError(
      'context_too_large',
      `${exceeded[0]} exceeds the ${exceeded[2]} character limit.`,
    )
  }
}

function validateLanguagePolicy(input: GenerateReplyDraftInput): void {
  if (input.defaultLanguage.length > maxLanguageTagLength) {
    throw new AiDraftingError(
      'invalid_provider_config',
      'Default language exceeds the 35 character limit.',
    )
  }

  if (input.mappedLanguages.length > maxMappedLanguages) {
    throw new AiDraftingError(
      'invalid_provider_config',
      'Reply Language Policy has too many mapped languages.',
    )
  }

  if (input.mappedLanguages.some((language) => language.length > maxLanguageTagLength)) {
    throw new AiDraftingError(
      'invalid_provider_config',
      'Mapped language exceeds the 35 character limit.',
    )
  }
}
