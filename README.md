# Order Buddy

Order Buddy is a private internal product pipeline app for a golf apparel business. It helps you and a business partner track:

- product ideas, samples, approved bulk runs, and canceled products
- drop days and which products belong to each planned release
- production lead times and shipping lead times
- estimated bulk-ready dates and estimated arrival dates
- cost entries per product with a total landed cost view

## What is included

- `Dashboard` with counts, upcoming bulk-ready dates, and upcoming arrivals
- `All Products` board split into `Idea`, `Sample`, `Bulk`, and `Canceled`
- `Drop Days` overview for organizing products into planned releases
- `Calendar` view for delivery and schedule visibility
- `Product Detail` editing panel for notes, dates, lead times, and costs
- `Product images` with file upload and preview thumbnails
- `Supabase`-ready auth and data model, plus demo mode when env vars are not set

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

If you do not set Supabase environment variables, the app runs in demo mode using browser local storage so you can explore the workflow right away.

## Enable shared live data with Supabase

1. Create a Supabase project.
2. In the Supabase SQL editor, run these files in order:
   - `supabase/schema.sql`
   - `supabase/workspace-access-controls.sql`
   - `supabase/workspace-access-hardening.sql`
3. Initialize the store before its administrator signs up:

```sql
select public.bootstrap_workspace(
  'owner@example.com',
  'Store Name'
);
```

Only the database owner or Supabase `service_role` can execute this function. It refuses
to replace a different active administrator.

4. Deploy `supabase/functions/invite-workspace-user/index.ts` as the
   `invite-workspace-user` Edge Function with JWT verification enabled.
5. Copy `.env.example` to `.env.local`.
6. Add:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

7. Restart the app.
8. The configured owner can create an account and becomes the administrator. Other direct
   sign-ups remain pending until approved; emailed invitations are pre-approved.

If you are adding product images to an existing project that already ran the original schema, also run:

```bash
supabase/product-images.sql
```

If you are updating an existing project to track sample production and shipping lead times, also run:

```bash
supabase/sample-timeline.sql
```

## Deployment

This app is set up well for Vercel:

1. Push the project to GitHub.
2. Import it into Vercel.
3. Add the same Supabase environment variables in Vercel.
4. Deploy.

Once deployed with Supabase configured, both users can sign in and work in the same shared product pipeline.

If you connect the repository to Vercel for automatic Git-based deploys, make sure new commits use the same email address as your GitHub account so Vercel can identify the author correctly.

The project is intended to be deployed from the `main` branch in Vercel.

## Deploying the same app for another brand

Use one GitHub repository, but create a separate Supabase project and a separate Vercel
project for every brand. Do not use Git branches as a data-isolation boundary.

For each brand:

1. Create an empty Supabase project.
2. Apply the schema and workspace SQL files in the order above.
3. Call `bootstrap_workspace` with that brand's store name and owner email.
4. Deploy the invitation Edge Function to that Supabase project.
5. Create a new Vercel project connected to this repository's `main` branch.
6. Set that Vercel project's `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the matching Supabase project.
7. Deploy and verify that the new instance has no products, drops, costs, users, or images
   from any other brand.

This arrangement shares application updates while keeping databases, authentication,
files, environment variables, deployments, and rollbacks independent.
