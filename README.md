# Order Buddy

Order Buddy is a product-development and production pipeline app built for an apparel business.

It replaces scattered notes and spreadsheets with one workflow for managing product ideas, samples, bulk production, launch dates, lead times, costs, images, and expected arrivals.

## What it solves

Apparel production involves a lot of moving pieces: samples, revisions, factory timelines, shipping, product costs, launch dates, and product imagery.

Order Buddy puts that information into a single operational view so a team can quickly answer:

- What are we developing?
- Which samples are waiting on a decision?
- What has moved into bulk production?
- What belongs to the next drop?
- When should inventory be ready?
- When should it arrive?
- What has each product cost so far?

## Features

- Product pipeline: Idea → Sample → Bulk → Canceled
- Dashboard with upcoming production and arrival dates
- Drop-day planning
- Calendar view
- Product detail workspace
- Sample production and shipping lead times
- Bulk production and shipping lead times
- Estimated ready and arrival dates
- Product images
- Cost tracking and landed-cost visibility
- Notes and product history
- Supabase-backed shared data
- Authentication and controlled workspace access
- Demo/local-storage mode when Supabase is not configured

## Stack

- Next.js 16
- React 19
- TypeScript
- Supabase
- PostgreSQL
- Tailwind CSS
- date-fns
- Vercel-ready deployment

## Data model

The app is designed around products moving through a real operating workflow rather than around generic tasks.

Supabase migrations cover:
- product and pipeline data
- workspace access controls
- access hardening
- product images
- sample timelines
- shared team access

## Local development

```bash
npm install
npm run dev
```

Without Supabase environment variables, the app can run in demo mode using browser local storage.

For a shared deployment:

```bash
cp .env.example .env.local
```

Then configure the required Supabase URL and public client key locally. Production credentials are not stored in the repository.

---

Built by [Joel Haymour](https://github.com/joelhaymour).
