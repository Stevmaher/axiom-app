// ============================================================
// إعدادات Supabase — القيمتين من Settings > API في مشروعك
// الـ anon key عام بطبيعته (مش سر)؛ الأمان كله بيعتمد على RLS.
// ============================================================
const SUPABASE_URL = "https://lxbqnzfmhzbyypohysbb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4YnFuemZtaHpieXlwb2h5c2JiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNzQ5NTYsImV4cCI6MjEwNDk1MDk1Nn0.N9jTR4TbSrtHVRx4_f6zbjaeT2SHukTRhONlwmxHvck";

// مؤقت: fallback للإيميل لحد ما login.html و admin.html يتحوّلوا لـ axiomIsAdmin.
// بعدها احذف السطرين دول. ده للـ UI بس — الصلاحية الحقيقية في is_admin() بقاعدة البيانات.
const ADMIN_EMAILS = ["estevanmaher5@gmail.com"];
const AXIOM_LEGACY_EMAIL_ADMIN = true;

// الأدمن بـ app_metadata.role (المستخدم مايقدرش يعدّلها؛ بتتحط من السيرفر/SQL بس)
function axiomIsAdmin(user) {
  if (!user) return false;
  if (user.app_metadata && user.app_metadata.role === "admin") return true;
  return AXIOM_LEGACY_EMAIL_ADMIN && ADMIN_EMAILS.includes(user.email);
}

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
