export type ReplyLanguagePolicy = {
  defaultLanguage: string
  mappedLanguages: string[]
}

export function chooseReplyLanguage(policy: ReplyLanguagePolicy, detectedReviewLanguage: string | null): string {
  if (detectedReviewLanguage === null) {
    return policy.defaultLanguage
  }

  if (
    detectedReviewLanguage === policy.defaultLanguage ||
    policy.mappedLanguages.includes(detectedReviewLanguage) ||
    policy.mappedLanguages.length === 0
  ) {
    return detectedReviewLanguage
  }

  return policy.defaultLanguage
}
