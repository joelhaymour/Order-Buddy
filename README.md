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
2. In the Supabase SQL editor, run `supabase/schema.sql`.
3. Copy `.env.example` to `.env.local`.
4. Add:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

5. Restart the app.
6. Use the sign-up screen to create the first two user accounts for you and your business partner.

## Deployment

This app is set up well for Vercel:

1. Push the project to GitHub.
2. Import it into Vercel.
3. Add the same Supabase environment variables in Vercel.
4. Deploy.

Once deployed with Supabase configured, both users can sign in and work in the same shared product pipeline.
