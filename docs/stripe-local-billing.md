# Local Cloud billing

Test Organization subscriptions against a Stripe sandbox. The [auth configuration](../apps/api/src/auth.ts) defines the integration; [plan limits](../packages/billing/src/plans.ts) remain internal to ReviewInbox.

## Setup

Install and authenticate the Stripe CLI, then set these values in `.env`:

```env
DEPLOYMENT_MODE=cloud
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_STARTER_ANNUAL_PRICE_ID=price_...
```

Configure one complete monthly/annual recurring-price pair to test a plan. Pro and Business have equivalent `STRIPE_PRO_*` and `STRIPE_BUSINESS_*` settings in [.env.example](../.env.example). Only complete pairs are offered. Match prices to the [published pricing configuration](../apps/site/src/lib/pricing.ts).

Start the API/web stack with `pnpm serve` and webhook forwarding in another terminal:

```sh
pnpm stripe:listen
```

Copy the listener's signing secret to `STRIPE_WEBHOOK_SECRET` and restart the API. Use Stripe's [test cards](https://docs.stripe.com/testing#cards) in Checkout; never use real payment details in a sandbox.

Subscriptions attach to the active Organization. Owners/admins manage billing; subscription callbacks synchronize its internal plan. Verify checkout, updates, and cancellation through the Organization billing screen and webhook listener.
