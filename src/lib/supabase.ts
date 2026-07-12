"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const productImagesBucket = "product-images";
let browserClient: SupabaseClient | null = null;

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function getSupabaseBrowserClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  if (browserClient) {
    return browserClient;
  }

  browserClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return browserClient;
}

export function getProductImageUrl(imagePath: string | null | undefined) {
  if (!imagePath) {
    return null;
  }

  if (
    imagePath.startsWith("http://") ||
    imagePath.startsWith("https://") ||
    imagePath.startsWith("data:")
  ) {
    return imagePath;
  }

  return null;
}

export async function getProductImageSignedUrl(imagePath: string | null | undefined) {
  const directUrl = getProductImageUrl(imagePath);
  if (directUrl || !imagePath) {
    return directUrl;
  }

  const client = getSupabaseBrowserClient();
  if (!client) {
    return null;
  }

  const { data, error } = await client.storage
    .from(productImagesBucket)
    .createSignedUrl(imagePath, 60 * 60);
  return error ? null : data.signedUrl;
}
