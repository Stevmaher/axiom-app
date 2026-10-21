import { createClient } from "jsr:@supabase/supabase-js@2";
import { WORKER_SRC } from "./worker_src.ts";

// الـ JWT بيتفحص جوه الدالة بـ auth.getUser (بيسأل السيرفر فعلاً)،
// وبعدها بنتأكد من الاشتراك (active + expires_at) بـ service role.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function deny(status: number, reason: string) {
  return new Response(JSON.stringify({ error: reason }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET") return deny(405, "method_not_allowed");

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return deny(401, "missing_token");

  const { data, error } = await admin.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return deny(401, "invalid_token");

  const isAdmin = user.app_metadata?.role === "admin";
  if (!isAdmin) {
    const { data: sub, error: sErr } = await admin
      .from("subscriptions")
      .select("active, expires_at")
      .eq("id", user.id)
      .maybeSingle();
    if (sErr) return deny(503, "subscription_lookup_failed");
    if (!sub || !sub.active) return deny(403, "no_active_subscription");
    if (sub.expires_at && new Date(sub.expires_at).getTime() <= Date.now()) {
      return deny(403, "subscription_expired");
    }
  }

  return new Response(WORKER_SRC, {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
});
