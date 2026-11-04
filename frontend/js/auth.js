// auth.js - Authentication, registration, and session management

import { state, setToken, setCurrentUser, clearSession } from "./state.js";
import { apiRegister, apiLogin, apiLogout, readErrorMessage } from "./api.js";

export function setAuthMessage(text, type) {
  const el = document.getElementById("auth-message");
  if (!el) return;
  el.textContent = text || "";
  el.classList.remove("error", "success");
  if (text) el.classList.add(type === "success" ? "success" : "error");
}

export function clearAuthMessage() {
  setAuthMessage("");
}

export function showRegister(e) {
  if (e) e.preventDefault();
  clearAuthMessage();
  document.getElementById("login-form")?.classList.add("hidden");
  document.getElementById("register-form")?.classList.remove("hidden");
}

export function showLogin(e) {
  if (e) e.preventDefault();
  clearAuthMessage();
  document.getElementById("register-form")?.classList.add("hidden");
  document.getElementById("login-form")?.classList.remove("hidden");
}

export async function register(onSuccess) {
  if (state.authBusy) return;
  clearAuthMessage();

  const usernameInput = document.getElementById("register-username");
  const emailInput = document.getElementById("register-email");
  const passwordInput = document.getElementById("register-password");

  const username = usernameInput ? usernameInput.value.trim() : "";
  const email = emailInput ? emailInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value : "";

  if (!username || !email || !password) {
    setAuthMessage("Username, email, and password are required.");
    return;
  }

  const btn = document.querySelector("#register-form button");
  state.authBusy = true;
  if (btn) btn.disabled = true;

  try {
    const res = await apiRegister(username, email, password);
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Registration failed. Please try again."));
    }

    // Success: reset register form, switch to login with username prefilled
    if (usernameInput) usernameInput.value = "";
    if (emailInput) emailInput.value = "";
    if (passwordInput) passwordInput.value = "";

    showLogin();
    const loginUser = document.getElementById("login-username");
    const loginPass = document.getElementById("login-password");
    if (loginUser) loginUser.value = username;
    if (loginPass) {
      loginPass.value = "";
      loginPass.focus();
    }
    setAuthMessage("Registration successful! You can now log in.", "success");
    if (typeof onSuccess === "function") onSuccess();
  } catch (err) {
    setAuthMessage(err.message || "Registration failed. Please try again.");
  } finally {
    state.authBusy = false;
    if (btn) btn.disabled = false;
  }
}

export async function login(onSuccess) {
  if (state.authBusy) return;
  clearAuthMessage();

  const usernameInput = document.getElementById("login-username");
  const passwordInput = document.getElementById("login-password");

  const username = usernameInput ? usernameInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value : "";

  if (!username || !password) {
    setAuthMessage("Username and password are required.");
    return;
  }

  const btn = document.querySelector("#login-form button");
  state.authBusy = true;
  if (btn) btn.disabled = true;

  try {
    const res = await apiLogin(username, password);
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Invalid username or password"));
    }

    const data = await res.json();
    setToken(data.token);
    setCurrentUser({ id: data.user_id, username: data.username, email: data.email });

    clearAuthMessage();
    if (passwordInput) passwordInput.value = "";

    if (typeof onSuccess === "function") {
      onSuccess();
    }
  } catch (err) {
    setAuthMessage(err.message || "Invalid username or password");
    if (passwordInput) passwordInput.select();
  } finally {
    state.authBusy = false;
    if (btn) btn.disabled = false;
  }
}

export async function logout(onLogout) {
  await apiLogout();
  clearSession();
  clearAuthMessage();

  if (typeof onLogout === "function") {
    onLogout();
  }
}

