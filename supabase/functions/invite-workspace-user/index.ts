import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) {
      return json({ error: "Authentication required." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser();
    if (userError || !user) {
      return json({ error: "Authentication required." }, 401);
    }

    const { data: member } = await callerClient
      .from("workspace_members")
      .select("role,status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (member?.role !== "admin" || member.status !== "active") {
      return json({ error: "Administrator access required." }, 403);
    }

    const body = await request.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = body.role === "admin" ? "admin" : "member";
    const permissions = body.permissions ?? {};
    const redirectTo = String(body.redirectTo ?? "").trim() || undefined;

    if (!email || !email.includes("@")) {
      return json({ error: "A valid email address is required." }, 400);
    }

    const { data: invitation, error: invitationError } = await adminClient
      .from("workspace_invitations")
      .insert({
        email,
        role,
        permissions,
        invited_by: user.id,
      })
      .select("id")
      .single();
    if (invitationError) {
      return json({ error: invitationError.message }, 400);
    }

    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    });
    if (inviteError) {
      await adminClient
        .from("workspace_invitations")
        .update({ status: "failed" })
        .eq("id", invitation.id);
      return json({ error: inviteError.message }, 400);
    }

    return json({ success: true });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Unable to send invitation." },
      500,
    );
  }
});

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
