// ============================================================
// حارس الدخول: يتحقق إن المستخدم مسجّل دخول ومفعّل قبل ما يفتح التطبيق
// ضيف السطر ده في <head> بتاع index.html قبل ما تحمل أي حاجة تانية:
// <script src="./supabase-config.js"></script>
// <script src="./auth-guard.js"></script>
// ============================================================
(async function () {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (!session) {
    window.location.href = "./login.html";
    return;
  }

  // لو الأدمن دخل هنا بالغلط، وديه للوحته
  if (ADMIN_EMAILS.includes(session.user.email)) {
    return; // الأدمن مسموح له يشوف التطبيق كمان لو حب
  }

  const { data: sub, error } = await supabaseClient
    .from("subscriptions")
    .select("active")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error || !sub || !sub.active) {
    await supabaseClient.auth.signOut();
    window.location.href = "./login.html";
  }
})();

// دالة تقدر تربطها بزرار "تسجيل خروج" لو ضفته في الصفحة
async function axiomLogout() {
  await supabaseClient.auth.signOut();
  window.location.href = "./login.html";
}
