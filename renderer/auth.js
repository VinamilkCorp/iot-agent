const loginScreen = document.getElementById("login-screen");
const loginStatus = document.getElementById("login-status");
const loginError  = document.getElementById("login-error");

const log = {
  info:  (msg) => console.log(`[auth] ${msg}`),
  warn:  (msg) => console.warn(`[auth] ${msg}`),
  error: (msg) => console.error(`[auth] ${msg}`),
};

function showError(msg) {
  const text = msg instanceof Error ? msg.message : String(msg);
  log.error(text);
  loginStatus.style.display = "none";
  loginError.style.display  = "block";
  loginError.textContent    = text;
}

function onLoginSuccess() {
  log.info("authentication successful — showing main UI");
  loginScreen.style.display = "none";
}

// ── Token helpers ─────────────────────────────────────────────────────────────
function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    // treat as expired 30 s before actual expiry
    return Date.now() / 1000 >= payload.exp - 30;
  } catch {
    return true;
  }
}

async function refreshTokens(env, refreshToken) {
  const tokenUrl = `${env.LOGIN_URL}/realms/${env.LOGIN_REALM}/protocol/openid-connect/token`;
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      client_id:     env.LOGIN_CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });
  const tokens = await res.json();
  if (!res.ok) throw new Error(tokens.error_description ?? tokens.error ?? "refresh failed");
  return tokens;
}

async function exchangeCode(env, code) {
  const tokenUrl = `${env.LOGIN_URL}/realms/${env.LOGIN_REALM}/protocol/openid-connect/token`;
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:   "authorization_code",
      client_id:    env.LOGIN_CLIENT_ID,
      redirect_uri: env.REDIRECT_URI,
      code,
    }),
  });
  const tokens = await res.json();
  if (!res.ok) throw new Error(tokens.error_description ?? tokens.error ?? "token exchange failed");
  return tokens;
}

function waitForCallback() {
  return new Promise((resolve) => {
    window.scale.onAuthCallback((params) => {
      log.info(`auth-callback received — params=${params}`);
      resolve(params);
    });
  });
}

async function startLoginFlow(env) {
  const state    = crypto.randomUUID();
  const nonce    = crypto.randomUUID();
  const loginUrl =
    `${env.LOGIN_URL}/realms/${env.LOGIN_REALM}/protocol/openid-connect/auth?` +
    new URLSearchParams({
      client_id:     env.LOGIN_CLIENT_ID,
      redirect_uri:  env.REDIRECT_URI,
      response_type: "code",
      scope:         "openid offline_access",
      state,
      nonce,
    });
  loginStatus.textContent = "Opening browser for login…";
  await window.scale.openLoginUrl(loginUrl);
  loginStatus.textContent = "Waiting for login in browser…";
  const callbackParams = await waitForCallback();
  await window.scale.reloadWithCallback(callbackParams);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function initAuth() {
  log.info("initAuth started");
  const env = await window.scale.getEnv();

  // ── Case 1: returning from auth redirect (code in sessionStorage) ──────────
  const storedCallback = sessionStorage.getItem("kcCallback");
  if (storedCallback) {
    sessionStorage.removeItem("kcCallback");
    log.info("exchanging authorization code for tokens");
    try {
      const { code } = Object.fromEntries(new URLSearchParams(storedCallback));
      const tokens = await exchangeCode(env, code);
      await window.scale.saveTokens(tokens);
      log.info("tokens saved");
      return onLoginSuccess();
    } catch (err) {
      log.error(`code exchange failed: ${err.message}`);
      await window.scale.clearTokens();
      showError(err);
      return;
    }
  }

  // ── Case 2: stored refresh token ───────────────────────────────────────────
  const stored = await window.scale.loadTokens();
  if (stored?.refresh_token) {
    if (!isTokenExpired(stored.refresh_token)) {
      log.info("stored refresh token is valid — attempting silent refresh");
      loginStatus.textContent = "Resuming session…";
      try {
        const tokens = await refreshTokens(env, stored.refresh_token);
        await window.scale.saveTokens(tokens);
        log.info("silent refresh successful");
        return onLoginSuccess();
      } catch (err) {
        log.warn(`silent refresh failed (${err.message}) — falling back to login`);
        await window.scale.clearTokens();
      }
    } else {
      log.warn("stored refresh token is expired — clearing and re-authenticating");
      await window.scale.clearTokens();
    }
  }

  // ── Case 3: no valid session — full login ──────────────────────────────────
  log.info("no valid session — starting login flow");
  try {
    await startLoginFlow(env);
  } catch (err) {
    showError(err);
  }
}

initAuth();
