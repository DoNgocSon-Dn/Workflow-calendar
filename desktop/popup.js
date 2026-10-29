let current;
let audioContext;
function ring() {
  try {
    audioContext ??= new AudioContext();
    void audioContext.resume();
    [0, 0.22, 0.44].forEach((offset, i) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.frequency.value = [659, 784, 988][i];
      const at = audioContext.currentTime + offset;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.12, at + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.36);
      oscillator.start(at);
      oscillator.stop(at + 0.4);
    });
  } catch {
    /* popup remains visible even if audio hardware is unavailable */
  }
}
window.reminderPopup.onUpdate(({ item, count, ring: shouldRing }) => {
  current = item;
  document.getElementById("title").textContent = item.title;
  document.getElementById("body").textContent = item.body;
  document.getElementById("count").textContent =
    count > 1 ? `+${count - 1} đang chờ` : "";
  document.getElementById("kind").textContent =
    item.kind === "reminder" ? "ĐẾN GIỜ CỦA BẠN" : "CÓ VIỆC CẦN CHÚ Ý";
  if (shouldRing) {
    document.body.classList.remove("ring");
    requestAnimationFrame(() => document.body.classList.add("ring"));
    if (item.sound) ring();
  }
});
for (const action of ["open", "snooze", "dismiss"]) {
  document.getElementById(action).addEventListener("click", () => {
    if (current) window.reminderPopup.act(action, current.id);
  });
}
window.reminderPopup.ready();
