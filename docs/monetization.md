# Monetization

## Pricing

- **Free:** 10 AI queries/day, 3 document uploads, stateless AI, unlimited rooms + streaks
- **Student Pro ($7/mo or $59/yr):** Unlimited AI queries + documents, conversational memory, Spaced Repetition, weekly progress email
- **Institution:** $3–5/student/yr

**Pro is "Personal AI Tutor"**: the free tier uses only the shared knowledge base; Pro adds the student's own uploaded documents with prioritized recall and conversational memory. Upgrade prompts trigger at: document limit hit, generic AI answer, follow-up question attempt, Spaced Repetition tab view.

## Revenue Roadmap

(1) Deploy → (2) PostHog analytics → (3) Spaced Repetition (primary daily-use Pro feature) → (4) Stripe paywall → (5) Referral system → (6) Institutional portal.

## Implementation

Stripe paywall: `<ProGate>` component + `POST /billing/checkout|webhook|portal`. `isPro`/`proExpiresAt`/`stripeCustomerId` already on Users model.
