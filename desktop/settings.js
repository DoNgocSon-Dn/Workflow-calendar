const fields = ["supabaseUrl", "supabaseAnonKey", "apiUrl"];
const status = document.getElementById("status");
function values() {
  return Object.fromEntries(
    fields.map((key) => [key, document.getElementById(key).value.trim()]),
  );
}
function busy(on) {
  for (const id of ["check", "save"]) document.getElementById(id).disabled = on;
}
window.connectionSettings.get().then((config) => {
  for (const key of fields)
    document.getElementById(key).value = config[key] || "";
});
document.getElementById("check").addEventListener("click", async () => {
  busy(true);
  status.textContent = "Đang kiểm tra Supabase và backend…";
  try {
    status.textContent = await window.connectionSettings.check(values());
  } catch (error) {
    status.textContent = error.message;
  } finally {
    busy(false);
  }
});
document
  .getElementById("connection")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    busy(true);
    try {
      await window.connectionSettings.save(values());
      status.textContent = "Đã lưu.";
    } catch (error) {
      status.textContent = error.message;
    } finally {
      busy(false);
    }
  });
