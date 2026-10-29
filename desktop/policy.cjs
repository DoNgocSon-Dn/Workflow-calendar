const ORIGIN = "http://127.0.0.1:42817";

function isLocalPage(value) {
  try {
    return new URL(value).origin === ORIGIN;
  } catch {
    return false;
  }
}

function normalizeNotification(input) {
  if (
    !input ||
    typeof input.id !== "string" ||
    !input.id ||
    input.id.length > 200 ||
    typeof input.title !== "string" ||
    !input.title.trim()
  )
    return null;
  const short = (value, max) =>
    typeof value === "string" ? value.slice(0, max) : undefined;
  return {
    id: input.id,
    title: input.title.slice(0, 180),
    body: short(input.body, 1000) || "",
    eventId: short(input.eventId, 200),
    groupId: short(input.groupId, 200),
    messageId: short(input.messageId, 200),
    kind: short(input.kind, 40) || "system",
    sound: input.sound !== false,
  };
}

function normalizeConnection(input) {
  if (
    !input ||
    typeof input.supabaseUrl !== "string" ||
    typeof input.supabaseAnonKey !== "string" ||
    typeof input.apiUrl !== "string"
  )
    throw new Error("Hãy điền đủ ba trường kết nối.");
  const supabase = new URL(input.supabaseUrl.trim());
  const api = new URL(input.apiUrl.trim());
  if (
    supabase.protocol !== "https:" ||
    !/^[a-z0-9-]+\.supabase\.co$/.test(supabase.hostname) ||
    supabase.username ||
    supabase.password ||
    supabase.port ||
    !["", "/"].includes(supabase.pathname) ||
    supabase.search ||
    supabase.hash
  )
    throw new Error("Supabase URL phải có dạng https://project-id.supabase.co");
  if (
    api.protocol !== "https:" ||
    api.username ||
    api.password ||
    api.search ||
    api.hash
  )
    throw new Error("Backend URL phải là địa chỉ HTTPS.");
  const key = input.supabaseAnonKey.trim();
  if (key.startsWith("sb_secret_"))
    throw new Error(
      "Không nhập secret/service-role key vào ứng dụng. Hãy dùng publishable/anon key.",
    );
  if (!key.startsWith("sb_publishable_")) {
    let payload;
    try {
      payload = JSON.parse(
        Buffer.from(key.split(".")[1], "base64url").toString(),
      );
    } catch {
      /* invalid key */
    }
    if (payload?.role !== "anon")
      throw new Error("Khóa này không phải publishable/anon key.");
  }
  return {
    supabaseUrl: supabase.origin,
    supabaseAnonKey: key,
    apiUrl: api.href.replace(/\/+$/, ""),
  };
}

module.exports = {
  ORIGIN,
  isLocalPage,
  normalizeNotification,
  normalizeConnection,
};
