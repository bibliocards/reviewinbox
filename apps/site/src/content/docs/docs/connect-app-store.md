---
title: Connect App Store reviews
description: Create an App Store Connect API key and connect an App Store app to ReviewInbox.
---

ReviewInbox uses the App Store Connect API to read customer reviews and publish replies for an App Store app. Apple API keys are scoped by role; ReviewInbox only needs the Store Credential you provide for the connection.

This guide was verified on 2026-09-20. The role and app access assigned to an App Store Connect key determine what that key can do, so choose the narrowest access that supports review work.

## Before you start

You need:

- an app in App Store Connect;
- an Account Holder who can request App Store Connect API access; and
- the app's numeric App Store ID.

Apple's [App Store Connect API setup guide](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api) explains the access request and key options. An Account Holder, Admin, or Customer Support user can respond to reviews in App Store Connect; Apple documents the [role permissions](https://developer.apple.com/help/app-store-connect/reference/account-management/role-permissions).

## Create an API key

1. In App Store Connect, open **Users and Access → Integrations → App Store Connect API**.
2. The Account Holder requests access if the API has not been enabled for the team. Apple reviews this request.
3. After access is approved, create a **Team Key**. Choose the narrowest team role that includes publishing replies to customer reviews; Customer Support is the narrowest role Apple documents for that action.
4. Download the private key immediately. Apple makes a private key available for download only once.
5. Copy the **Issuer ID** from the API keys page and the **Key ID** for the downloaded key.

ReviewInbox currently accepts Team Key credentials because its App Store Connect JWT uses the team's Issuer ID. Individual Keys use a different authentication claim and cannot be entered in this form. Revoke and recreate a key if its role or access needs to change; Apple does not let you edit a generated key's access level.

## Add the connection in ReviewInbox

Create an App, choose App Store, and enter:

- **App Store App ID**: the numeric ID shown in the app's App Store Connect URL or app information;
- **Issuer ID**: the value shown near the top of the API keys page;
- **Key ID**: the ID for the private key you downloaded; and
- **Private key**: the complete `.p8` file contents, including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`.

ReviewInbox validates the connection when you save it. If validation fails, check that the App Store ID and key belong to the same App Store Connect team, that the key has customer review access, and that the private key is copied without extra characters.

## Data and publishing limits

The App Store Connect API provides paginated customer reviews, with a maximum of 200 reviews per list request. ReviewInbox follows the API's pagination links and stores the app version when Apple includes it in the response. Apple lets you respond to reviews regardless of when they were written, and each review can have one public reply.

Apple says a Published Reply can take up to 24 hours to appear on the App Store while it remains pending in App Store Connect. Keep replies concise and avoid personal information, marketing language, or spam; see Apple's guidance on [ratings, reviews, and responses](https://developer.apple.com/app-store/ratings-and-reviews/).

## Revoke access

In App Store Connect, open **Users and Access → Integrations**, select the key, and choose **Revoke Key**. A revoked key cannot be reinstated. Then open the App in ReviewInbox and replace its Store Credential with a new Team Key. If you want to remove the connection entirely, delete the App from ReviewInbox; this also removes the App's reviews, Reply Drafts, and Store Connections, so use that action only when the App and its data are no longer needed.

Further reading: [Customer Reviews API](https://developer.apple.com/documentation/appstoreconnectapi/customer-reviews), [Customer Review Responses API](https://developer.apple.com/documentation/appstoreconnectapi/customer-review-responses), and [respond to reviews in App Store Connect](https://developer.apple.com/help/app-store-connect/monitor-ratings-and-reviews/respond-to-reviews).
