// ============================================================
// حارس الدخول: يتحقق إن المستخدم مسجّل دخول ومفعّل قبل ما يفتح التطبيق
// ضيف السطر ده في <head> بتاع index.html قبل ما تحمل أي حاجة تانية:
// <script src="./supabase-config.js"></script>
// <script src="./auth-guard.js"></script>
// ============================================================

// ─────────────────────────────────────────────────────────────
// معلومات الجهاز: للعرض والتسجيل فقط، مالهاش أي تأثير على قرار
// السماح بالدخول. أي فشل هنا لازم يتبلع بصمت ومايوقفش تسجيل الدخول.
// ─────────────────────────────────────────────────────────────

function axiomParseUserAgent(ua) {
  const text = String(ua || "");
  let os = "نظام غير معروف";
  let type = "Desktop";
  let browser = "متصفح غير معروف";
  let model = "";

  if (/Android/i.test(text)) {
    const m = text.match(/Android\s+([0-9._]+)/i);
    os = m ? `Android ${m[1].replace(/_/g, ".")}` : "Android";
    type = /Mobile/i.test(text) ? "Mobile" : "Tablet";
    const mm = text.match(/Android[^;)]*;\s*(?:wv;\s*)?([^;)]+?)(?:\s+Build\/[^;)]+)?[;)]/i);
    if (mm && mm[1]) model = mm[1].trim();
  } else if (/iPhone|iPod/i.test(text)) {
    os = "iOS"; type = "Mobile"; model = "iPhone";
  } else if (/iPad/i.test(text)) {
    os = "iPadOS"; type = "Tablet"; model = "iPad";
  } else if (/Windows/i.test(text)) {
    os = "Windows"; type = "Desktop";
  } else if (/Mac OS X|Macintosh/i.test(text)) {
    os = "macOS"; type = "Desktop";
  } else if (/Linux/i.test(text)) {
    os = "Linux"; type = "Desktop";
  }

  if (/Edg\//i.test(text)) browser = "Edge";
  else if (/OPR\//i.test(text)) browser = "Opera";
  else if (/SamsungBrowser/i.test(text)) browser = "Samsung Internet";
  else if (/Firefox\//i.test(text)) browser = "Firefox";
  else if (/CriOS\//i.test(text) || /Chrome\//i.test(text)) browser = "Chrome";
  else if (/Safari\//i.test(text) && !/Chrome|Chromium|CriOS|Edg|OPR/i.test(text)) browser = "Safari";

  return { os, type, browser, model, user_agent: text };
}

// اسم مفهوم للعرض لو الموديل الحقيقي مش متاح
function axiomFallbackDeviceName(type, os) {
  if (/Android/i.test(os)) return "Android Device";
  if (/iOS/i.test(os)) return "iPhone";
  if (/iPadOS/i.test(os)) return "iPad";
  if (/Windows/i.test(os)) return "Windows PC";
  if (/macOS/i.test(os)) return "Mac";
  if (/Linux/i.test(os)) return "Linux PC";
  return type === "Mobile" ? "Mobile Device" : type === "Tablet" ? "Tablet" : "Desktop";
}

// بيحاول ياخد تفاصيل أدق من User-Agent Client Hints لو متاحة، من غير ما
// يعتمد عليها كشرط لأي حاجة — لو مش متاحة أو فشلت، بيرجع بس نتيجة UA العادي.
async function axiomCollectDeviceInfo() {
  const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  const base = axiomParseUserAgent(ua);

  let device_model = base.model || "";
  let os = base.os;
  let type = base.type;
  let browser = base.browser;

  try {
    const uaData = typeof navigator !== "undefined" ? navigator.userAgentData : null;
    if (uaData && typeof uaData.getHighEntropyValues === "function") {
      const hi = await uaData.getHighEntropyValues(["model", "platform", "platformVersion", "mobile"]);
      if (hi.model) device_model = hi.model;
      if (hi.platform) {
        if (/Windows/i.test(hi.platform)) os = "Windows";
        else if (/Android/i.test(hi.platform)) os = hi.platformVersion ? `Android ${hi.platformVersion}` : "Android";
        else if (/mac/i.test(hi.platform)) os = "macOS";
        else if (/Linux/i.test(hi.platform)) os = "Linux";
      }
      if (typeof hi.mobile === "boolean" && type === "Desktop" && hi.mobile) {
        type = "Mobile";
      }
    }
  } catch (_) {
    // Client Hints مش متاحة أو اترفضت — نكتفي بنتيجة UA العادي
  }

  const device_name = device_model || axiomFallbackDeviceName(type, os);

  return {
    device_name,
    device_type: type,
    device_model: device_model || null,
    os,
    browser,
    user_agent: ua
  };
}

// ─────────────────────────────────────────────────────────────
// الحارس. تنبيه مهم: ده حماية UX بس، مش حماية حقيقية — الكود كله
// بيوصل للمتصفح. الحماية الفعلية = RLS + تقديم الـ worker من Edge Function.
// ─────────────────────────────────────────────────────────────
const AXIOM_RECHECK_MS = 5 * 60 * 1000;
let axiomLastCheck = 0;

// مخفي لحد ما التحقق يخلص (fail-closed): مفيش فلاش للتطبيق لغير المشتركين
document.documentElement.style.visibility = "hidden";

function axiomDomReady() {
  return document.readyState === "loading"
    ? new Promise((r) => document.addEventListener("DOMContentLoaded", r, { once: true }))
    : Promise.resolve();
}

function axiomReveal() {
  document.documentElement.style.visibility = "";
}

async function axiomDeny() {
  try { await supabaseClient.auth.signOut(); } catch (_) {}
  window.location.replace("./login.html");
}

// مشكلة اتصال ≠ اشتراك منتهي: ماينفعش نطرد مشترك عشان النت وقع لحظة
function axiomShowConnectionError() {
  const box = document.createElement("div");
  box.setAttribute("dir", "rtl");
  box.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;" +
    "align-items:center;justify-content:center;gap:16px;background:#1B262C;color:#fff;" +
    "font:700 18px Tajawal,sans-serif;text-align:center;padding:24px";
  const msg = document.createElement("div");
  msg.textContent = "تعذّر التحقق من الحساب. اتأكد من الاتصال وحاول تاني.";
  const btn = document.createElement("button");
  btn.textContent = "إعادة المحاولة";
  btn.style.cssText = "padding:10px 22px;font:inherit;border-radius:10px;border:0;cursor:pointer";
  btn.onclick = () => window.location.reload();
  box.append(msg, btn);
  document.documentElement.append(box);
  axiomReveal();
}

// بترجع { ok:true, user } أو { ok:false, reason:"denied"|"network" }
async function axiomCheckAccess() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return { ok: false, reason: "denied" };

  // getUser بيسأل السيرفر فعلاً (getSession بيقرأ التخزين المحلي بس)،
  // فمستخدم اتحذف/اتعطّل مايفضلش شغال لحد ما التوكن ينتهي.
  const { data: ud, error: uErr } = await supabaseClient.auth.getUser();
  if (uErr) {
    const net = !uErr.status || uErr.status >= 500;
    return { ok: false, reason: net ? "network" : "denied" };
  }
  const user = ud && ud.user;
  if (!user) return { ok: false, reason: "denied" };

  if (axiomIsAdmin(user)) return { ok: true, user, admin: true };

  // لو جدول subscriptions فيه عمود انتهاء (expires_at مثلاً) ضيفه هنا
  // أو الأفضل تطبّقه في RLS/view عشان يتفرض من السيرفر.
  const { data: sub, error: sErr, status } = await supabaseClient
    .from("subscriptions")
    .select("active,expires_at")
    .eq("id", user.id)
    .maybeSingle();

  if (sErr) {
    const net = status === 0 || status >= 500;
    return { ok: false, reason: net ? "network" : "denied" };
  }
  if (!sub || !sub.active) return { ok: false, reason: "denied" };
  if (sub.expires_at && new Date(sub.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "denied" };
  }
  return { ok: true, user, admin: false };
}

async function axiomRecheck() {
  const now = Date.now();
  if (now - axiomLastCheck < 30000) return; // مايتكررش أسرع من 30 ثانية
  axiomLastCheck = now;
  try {
    const res = await axiomCheckAccess();
    if (!res.ok && res.reason === "denied") await axiomDeny();
  } catch (_) { /* خطأ شبكة: نكمل ونحاول في الدورة الجاية */ }
}

// app.js لازم يستنى: await window.axiomReady قبل ما يشغّل الـ solver/الـ worker.
// لو الدخول مرفوض الـ promise بيترفض (والصفحة بتتحوّل لـ login).
window.axiomReady = (async function () {
  try {
    await axiomDomReady();
    const res = await axiomCheckAccess();

    if (res.ok) {
      axiomLastCheck = Date.now();
      axiomReveal();
      setInterval(axiomRecheck, AXIOM_RECHECK_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") axiomRecheck();
      });
      return res.user;
    }

    if (res.reason === "network") {
      axiomShowConnectionError();
      throw new Error("axiom: network");
    }
    await axiomDeny();
    throw new Error("axiom: denied");
  } catch (e) {
    // أي خطأ غير متوقع (مثلاً الـ CDN وقع فـ supabaseClient مش موجود): نفضل مقفولين
    if (!/^axiom:/.test(String((e && e.message) || ""))) axiomShowConnectionError();
    throw e;
  }
})();
window.axiomReady.catch(() => {});

// أي خروج (من الزرار، من تبويب تاني، أو من الحارس) → نظّف وروح للدخول.
// اربط في app.js دالة مسح اللوحة المحفوظة على الحدث ده:
//   window.addEventListener("axiom:signed-out", clearSavedBoard);
if (typeof supabaseClient !== "undefined") {
  supabaseClient.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      try { window.dispatchEvent(new Event("axiom:signed-out")); } catch (_) {}
      window.location.replace("./login.html");
    }
  });
}

// تربطها بزرار "تسجيل خروج"
async function axiomLogout() {
  try { await supabaseClient.auth.signOut(); } catch (_) {}
  window.location.replace("./login.html");
}
