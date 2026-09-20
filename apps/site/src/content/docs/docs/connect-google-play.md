---
title: Connect Google Play reviews
description: Set up Google Play Developer API access and connect a production app to ReviewInbox.
---

ReviewInbox uses the Google Play Developer **Reply to Reviews API**. This connection uses the reviews endpoints for one production app. Any other Play Console access available to the service account is controlled by the permissions you grant in Play Console.

This guide was verified on 2026-09-20. ReviewInbox calls the reviews endpoints only; the actual access available to a service account is controlled by the permissions you grant in Play Console. Use app-specific access and the least privilege that supports your workflow.

## Before you start

You need:

- a production app in Google Play Console;
- permission to manage users and permissions for that developer account; and
- a Google Cloud project where the Google Play Developer API can be enabled.

The [Google Play Developer API getting started guide](https://developers.google.com/android-publisher/getting_started) describes the complete setup. Google recommends a service account for server-to-server access.

## Create the service account

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project.
2. Open the [Google Play Developer API page](https://console.developers.google.com/apis/api/androidpublisher.googleapis.com/overview) and select **Enable**.
3. In **IAM & Admin → Service Accounts**, create a service account and download its JSON key.
4. In [Play Console → Users and permissions](https://play.google.com/console/developers/users-and-permissions), invite the service account email address.
5. Grant the app access and the **Reply to reviews** permission, then save the invitation.

Keep the downloaded JSON private. ReviewInbox encrypts Store Credentials at rest, but you should still revoke the service account or its key in Google Cloud if it is lost or exposed.

## Add the connection in ReviewInbox

Create an App, choose Google Play, and enter:

- **Package name**: the application ID from your Play Console app, such as `com.example.app`;
- **Service account JSON**: the complete JSON key file, including its opening and closing braces.

ReviewInbox validates the connection when you save it. If validation fails, check that the package name belongs to the same Play developer account as the invited service account, that the **Reply to reviews** permission is enabled, and that the Google Play Developer API is enabled in the selected Cloud project.

## Data and API limits

The Reply to Reviews API has a narrower view than Play Console:

- it exposes production app Reviews with written text;
- it returns reviews created or modified within the last week;
- a reply is limited to 350 characters; and
- the default API quotas are 200 GET requests per hour and 2,000 POST requests per day per app.

For older reviews, use the [Google Play Console CSV export](https://support.google.com/googleplay/android-developer/answer/6137710). ReviewInbox does not import that CSV automatically today, so do not expect the first sync to backfill the complete history.

Google also [discourages automated replies that are intended to be reviewed later](https://developers.google.com/android-publisher/reply-to-reviews#replying_to_reviews). ReviewInbox keeps drafting and publishing as separate actions so you can edit a Reply Draft before publishing it.

## Revoke access

Remove the service account from Play Console **Users and permissions**, then disable or delete the corresponding key in Google Cloud. In ReviewInbox, open the App and replace its Store Credential after access has been revoked. If you want to remove the connection entirely, delete the App from ReviewInbox; this also removes the App's reviews, Reply Drafts, and Store Connections, so use that action only when the App and its data are no longer needed.

Further reading: [Reply to Reviews API](https://developers.google.com/android-publisher/reply-to-reviews) and [Play Console review replies](https://support.google.com/googleplay/android-developer/answer/138230?hl=en).
