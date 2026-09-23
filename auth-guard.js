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

// تسجيل best-effort في security_logs. أي خطأ هنا (RLS، مفيش اتصال...)
// بيتبلع بصمت ومايأثرش على تسجيل الدخول ولا على أي منطق تاني.
async function axiomLogDeviceInfo(client, userId, eventType) {
  try {
    const info = await axiomCollectDeviceInfo();
    await client.from("security_logs").insert({
      user_id: userId,
      event_type: eventType,
      user_agent: info.user_agent,
      metadata: {
        device_name: info.device_name,
        device_type: info.device_type,
        device_model: info.device_model,
        os: info.os,
        browser: info.browser,
        user_agent: info.user_agent
      }
    });
  } catch (_) {
    // متعمد: تسجيل معلومات الجهاز مايوقفش ولا يأثر على أي حاجة تانية
  }
}

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
    return;
  }

  // تسجيل معلومات الجهاز بعد التأكد إن الدخول والاشتراك سليمين —
  // مش شرط لنجاح الدخول، مجرد تسجيل/عرض. لا يوقف تنفيذ باقي الصفحة.
  axiomLogDeviceInfo(supabaseClient, session.user.id, "login_success");
})();

// دالة تقدر تربطها بزرار "تسجيل خروج" لو ضفته في الصفحة
async function axiomLogout() {
  await supabaseClient.auth.signOut();
  window.location.href = "./login.html";
}
