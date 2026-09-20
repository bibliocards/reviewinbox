---
title: Manage App Store and Google Play reviews together
description: Understand the store differences before connecting App Store and Google Play to one ReviewInbox App.
---

ReviewInbox can keep App Store and Google Play reviews in one Reply Inbox for an App. The stores expose different data and permissions, so a connection that succeeds on one store does not imply the other store will return the same history.

## What is shared

For either store, ReviewInbox imports Reviews into the same queue, can create Reply Drafts, and keeps publishing as an explicit action. You can connect one store first and add the other later.

## What differs

| | App Store | Google Play |
| --- | --- | --- |
| Connection values | App Store ID, Issuer ID, Key ID, private `.p8` key | Package name and service account JSON |
| Review history through the API | Apple exposes paginated customer reviews, up to 200 per list request | Only written production reviews created or modified within the last week |
| Reply constraint | One public reply per review; Apple may show it as pending for up to 24 hours | 350 characters per reply; API quotas are 200 GET/hour and 2,000 POST/day per app |
| Setup permission | Account Holder requests API access; Customer Support can respond | Service account needs the Play Console **Reply to reviews** permission |

Read the [App Store setup guide](/docs/connect-app-store/) and [Google Play setup guide](/docs/connect-google-play/) before copying credentials into ReviewInbox.

## A practical first sync

1. Connect the store with the most recent reviews you need to work on.
2. Confirm that the connection validates and that the first Sync Run completes.
3. Treat an empty result carefully: Google may have no eligible Reviews with written text in its one-week API window, while Apple may simply have no Reviews for the selected App.
4. Edit each Reply Draft and publish only when it is ready for the store's public page.

For Google Play history older than the API window, Google provides a CSV export in Play Console. ReviewInbox does not import that export automatically today. See the [usage and limits](/docs/usage-limits/) page for ReviewInbox plan limits and [self-hosting](/docs/self-hosting/) for operating your own deployment.
