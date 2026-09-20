// ============================================================
// إعدادات Supabase — لازم تحطها من مشروعك على supabase.com
// Settings > API فيها القيمتين دول
// ============================================================
const SUPABASE_URL = "https://lxbqnzfmhzbyypohysbb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4YnFuemZtaHpieXlwb2h5c2JiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNzQ5NTYsImV4cCI6MjEwNDk1MDk1Nn0.N9jTR4TbSrtHVRx4_f6zbjaeT2SHukTRhONlwmxHvck";

// إيميل/إيميلات الأدمن (لازم تتطابق مع الـ is_admin() في قاعدة البيانات SQL)
const ADMIN_EMAILS = ["estevanmaher5@gmail.com"];

// إعدادات الـ Auth هنا صريحة عشان الجلسة تفضل ثابتة بين الزيارات:
// persistSession + storage=localStorage يخلّوا تسجيل الدخول يفضل شغّال
// بعد قفل المتصفح وفتحه تاني على نفس الجهاز، وautoRefreshToken يجدّد
// التوكن لوحده من غير ما يطلب من المستخدم يسجّل دخول تاني.
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: "my-app-auth",
  },
});
