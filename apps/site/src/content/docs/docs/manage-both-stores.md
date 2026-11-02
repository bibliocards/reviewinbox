---
title: Manage App Store and Google Play reviews together
description: Connect both stores, prepare replies, and publish from one Reply Inbox.
---

An App can connect to App Store, Google Play, or both. Each Store Connection imports into the same Reply Inbox, with its own credentials, Review history, and store reply limit. Start with the [App Store](/docs/connect-app-store/) or [Google Play](/docs/connect-google-play/) setup guide.

## One App, two stores, one Reply Inbox

If you ship the same mobile product on iOS and Android, create one App in ReviewInbox and add a Store Connection for each store. You can then work through both sets of Reviews in the same Reply Inbox, without switching between App Store Connect and Google Play Console to prepare each reply.

Connecting a store does not give AI permission to publish. A Reply Draft is proposed text; a Published Reply is text you explicitly sent to the store. Manual replies work without AI configuration. AI drafting uses the Review and your App's Reply Context, which should contain only verified guidance such as a confirmed fix or your support policy.

## Import and triage

1. Create an App and connect a store. ReviewInbox validates its Store Credential and queues the initial Sync Run.
2. Check the Sync Run result in Apps. Google exposes written production Reviews from a limited recent window, so an empty result does not necessarily indicate a failed connection.
3. Open the Reply Inbox and select a Review. Filter by App or workflow status as needed.
4. Work from an AI Reply Draft, request generation, or write a reply manually. AI drafting requires operator configuration.

Ignore a Review when it needs no reply; ignoring is reversible. Audit History records drafting actions and publication.

## Improve a draft

Edit the draft directly, or choose **Regenerate**:

1. Optionally select **Shorter**, **Warmer**, **More direct**, or **Less promotional**. Choices can be combined.
2. Add optional instructions for this Review, such as mentioning a fix or avoiding a support suggestion. These do not change the App's Reply Context.
3. Generate and preview the proposal. Regeneration uses the current editor text, including unsaved edits.
4. Choose **Use this proposal** to copy it into the editor, or **Keep current draft** to discard it. You can regenerate again with different instructions.

Accepting a proposal does not save or publish it. A generation failure preserves the current draft. Each successful Cloud proposal consumes a draft unit even if discarded; see [usage and limits](/docs/usage-limits/).

### Example: reply to an update complaint

The following is an illustrative workflow, not a customer testimonial or a report of a real incident.

A Review says: “Since the update, my lists won't sync between my phone and tablet.” Before publishing a reply:

1. Check whether your App's Reply Context has a confirmed sync incident or fix. Do not turn the complaint into a promise that a fix exists.
2. Prepare a manual Reply Draft or generate a proposal. If the draft invents a release date, recovery guarantee or support route, remove it unless you can verify it.
3. If more information is needed, use your established support process. A public store reply should not ask the reviewer to post their email, account details or other private information.
4. Review the language and store character limit, then explicitly publish. Regeneration and accepting a proposal are separate from publication.

If your team later confirms a fix, update Reply Context before drafting replies to similar Reviews. Use [Review analysis](/docs/review-analysis/) to inspect the Reviews behind a recurring sync topic rather than assuming every low rating describes the same problem.

## Publish explicitly

Review the text and language, then save or publish using the editor actions. Only publication sends the reply to the store. The editor displays the applicable store character limit.

If a published Review changes, it returns to the Reply Inbox with its previous Published Reply visible. Prepare and explicitly publish an updated reply. If the Review changes while you are working, reload its latest content before retrying a rejected action.

Use [Review analysis](/docs/review-analysis/) for recurring product problems. Google Play CSV history import is not currently available.

## Try it with your App

[Create a free Cloud Organization](https://cloud.reviewinbox.app/sign-up) to follow this workflow without running a server. The free plan supports one App with both Store Connections; [compare plans and usage limits](/pricing/) before importing your Reviews.
