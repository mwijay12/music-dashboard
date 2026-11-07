const $ = (selector) => document.querySelector(selector);

const state = {
  mode: "login",
  config: null,
  target: "/",
};

const COPY = {
  login: {
    title: "Welcome back.",
    copy: "Log in to pick up where your catalog left off.",
  },
  signup: {
    title: "Make your catalog sing.",
    copy: "Create your account with Google. Your first login sets everything up.",
  },
};

function safeNextTarget() {
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

function setNote(message) {
  const note = $("#authNote");
  if (!note) return;
  note.hidden = !message;
  note.textContent = message || "";
}

function setSetup(visible) {
  const setup = $("#authSetup");
  if (setup) setup.hidden = !visible;
}

function setMode(mode) {
  if (!COPY[mode]) return;
  state.mode = mode;
  document.querySelectorAll("[data-auth-tab]").forEach((tab) => {
    const active = tab.dataset.authTab === mode;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  const title = $("#authTitle");
  const copy = $("#authCopy");
  if (title) title.textContent = COPY[mode].title;
  if (copy) copy.textContent = COPY[mode].copy;
  renderGoogleButton();
}

function waitForGoogle(timeout = 9000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const check = () => {
      if (window.google?.accounts?.id) return resolve(window.google);
      if (Date.now() - started > timeout) return resolve(null);
      window.setTimeout(check, 100);
    };
    check();
  });
}

function renderGoogleButton() {
  const container = $("#googleButton");
  if (!container || !state.config?.googleClientId || !window.google?.accounts?.id) return;

  container.classList.remove("is-loading");
  container.innerHTML = "";

  const width = Math.min(340, Math.max(260, Math.round(container.clientWidth || 320)));
  window.google.accounts.id.renderButton(container, {
    type: "standard",
    theme: "outline",
    size: "large",
    shape: "pill",
    text: state.mode === "signup" ? "signup_with" : "signin_with",
    logo_alignment: "left",
    width,
  });
}

async function handleCredential(response) {
  const credential = response?.credential;
  if (!credential) {
    setNote("Google did not return a credential. Please try again.");
    return;
  }

  const container = $("#googleButton");
  container?.classList.add("is-loading");
  if (container) container.innerHTML = "";
  setNote("");

  try {
    const result = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
    });
    const data = await result.json().catch(() => ({}));

    if (!result.ok) throw new Error(data.error || "Google sign-in failed.");
    window.location.assign(state.target);
  } catch (error) {
    setNote(error instanceof Error ? error.message : "Google sign-in failed.");
    renderGoogleButton();
  }
}

async function init() {
  state.target = safeNextTarget();

  try {
    const me = await fetch("/api/me", { cache: "no-store" }).then((response) => response.json());
    if (me?.authenticated) {
      window.location.replace("/");
      return;
    }
  } catch {
    /* The config request below will surface the useful error. */
  }

  try {
    const config = await fetch("/api/config", { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error("Could not load auth configuration.");
      return response.json();
    });
    state.config = config;
  } catch {
    setNote("The auth server is not reachable. Start it with npm start.");
    return;
  }

  const demo = $("#authDemo");
  if (demo && state.config.authRequired) demo.hidden = true;

  if (!state.config.googleConfigured || !state.config.googleClientId) {
    setSetup(true);
    return;
  }

  setSetup(false);
  const container = $("#googleButton");
  container?.classList.add("is-loading");
  const google = await waitForGoogle();

  if (!google) {
    setNote("Google sign-in could not load. Check your connection and the authorized JavaScript origin in Google Cloud.");
    container?.classList.remove("is-loading");
    return;
  }

  google.accounts.id.initialize({
    client_id: state.config.googleClientId,
    callback: handleCredential,
    ux_mode: "popup",
    auto_select: false,
    cancel_on_tap_outside: true,
  });

  setMode("login");
}

document.querySelectorAll("[data-auth-tab]").forEach((tab) => {
  tab.addEventListener("click", () => setMode(tab.dataset.authTab));
  tab.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setMode(state.mode === "login" ? "signup" : "login");
    document.querySelector(`[data-auth-tab="${state.mode}"]`)?.focus();
  });
});

init();
