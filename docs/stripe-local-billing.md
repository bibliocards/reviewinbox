# Stripe Local Billing Setup

Use this when testing ReviewInbox cloud billing locally against a Stripe sandbox.

## Install Stripe CLI

On macOS:

```bash
brew install stripe/stripe-cli/stripe
stripe login
```

## Configure Local Environment

At minimum, local cloud billing needs Stripe secrets and one complete monthly/annual plan pair.

For Starter-only testing:

```env
DEPLOYMENT_MODE=cloud
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_STARTER_ANNUAL_PRICE_ID=price_...
```

`STRIPE_WEBHOOK_SECRET` comes from the local webhook listener below. Pro and Business price IDs can stay empty until those plans exist in Stripe.

## Run Webhooks Locally

Start the app stack in one terminal:

```bash
pnpm serve:cloud
```

Start Stripe webhook forwarding in another terminal:

```bash
pnpm stripe:listen
```

The Stripe CLI prints a webhook signing secret like `whsec_...`. Copy it into `.env` as `STRIPE_WEBHOOK_SECRET`, then restart the API.

## Test Payments

Use Stripe test cards in Checkout.

Successful payment:

```text
4242 4242 4242 4242
```

Use any future expiry date, any three-digit CVC, and any postal code.

Authentication required:

```text
4000 0025 0000 3155
```

Declined payment:

```text
4000 0000 0000 9995
```

## Required Stripe Prices

Use flat recurring prices:

- Starter monthly: `$9.99/month`
- Starter annual: `$99.99/year`
- Pro monthly: `$29.99/month`
- Pro annual: `$299.99/year`
- Business monthly: `$99.99/month`
- Business annual: `$999.99/year`

ReviewInbox enables only plans with both monthly and annual price IDs configured.
