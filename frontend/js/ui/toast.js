// toast.js - Toast notifications & activity log

export function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast " + (type === "error" ? "error" : "success");
  toast.textContent = message;
  container.appendChild(toast);
  while (container.children.length > 3) container.firstChild.remove();
  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 400);
  }, 3600);
}

export function logMessage(msg) {
  const log = document.getElementById("log-entries");
  if (!log) return;
  const entry = document.createElement("div");
  entry.className = "log-entry";
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  log.insertBefore(entry, log.firstChild);
  while (log.children.length > 50) log.removeChild(log.lastChild);
}

export function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

