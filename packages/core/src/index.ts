export type ReviewSource = "apple-app-store" | "google-play"

export type ReplyWorkflowStatus = "pending" | "drafted" | "published" | "ignored" | "failed"

export type ReplyLanguagePolicy = {
  defaultLanguage: string
  mappedLanguages: readonly string[]
}

export * from "./store-credential-vault.js"
