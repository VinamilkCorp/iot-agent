// ── In-memory token state ─────────────────────────────────────────────────────
let currentTokens = null;
let _refreshTimer = null;
let _env = null;

const TOKEN_EXPIRY_BUFFER_SEC = 30;
const TOKEN_PROACTIVE_REFRESH_SEC = 180;

function tokenExp(token) {
  try {
    return JSON.parse(atob(token.split(".")[1])).exp;
  } catch {
    return 0;
  }
}

function scheduleProactiveRefresh() {
  clearTimeout(_refreshTimer);
  if (!currentTokens?.access_token) return;
  const msUntilRefresh =
    (tokenExp(currentTokens.access_token) -
      Date.now() / 1000 -
      TOKEN_PROACTIVE_REFRESH_SEC) *
    1000;
  if (msUntilRefresh <= 0) return;
  _refreshTimer = setTimeout(async () => {
    log.info("proactive token refresh triggered");
    try {
      await getAccessToken();
    } catch (err) {
      log.warn(`proactive refresh failed: ${err.message}`);
    }
  }, msUntilRefresh);
  log.info(`next proactive refresh in ${Math.round(msUntilRefresh / 1000)}s`);
}

async function getAccessToken() {
  if (!currentTokens?.access_token) throw new Error("not authenticated");
  if (!isTokenExpired(currentTokens.access_token))
    return currentTokens.access_token;
  if (
    !currentTokens.refresh_token ||
    isTokenExpired(currentTokens.refresh_token)
  ) {
    await window.scale.clearTokens();
    throw new Error("session expired — please log in again");
  }
  log.info("access token expired — refreshing");
  const tokens = await refreshTokens(_env, currentTokens.refresh_token);
  currentTokens = tokens;
  await window.scale.saveTokens(tokens);
  scheduleProactiveRefresh();
  return currentTokens.access_token;
}

window.auth = { getAccessToken };

const loginScreen  = document.getElementById("login-screen");
const loginStatus  = document.getElementById("login-status");
const loginError   = document.getElementById("login-error");
const loginSpinner = document.getElementById("login-spinner");
const loginBtn     = document.getElementById("btn-login");

const log = {
  info: (msg) => console.log(`[auth] ${msg}`),
  warn: (msg) => console.warn(`[auth] ${msg}`),
  error: (msg) => console.error(`[auth] ${msg}`),
};

function setLoading(text) {
  loginBtn.disabled = true;
  loginSpinner.style.display = "block";
  loginStatus.style.display = text ? "block" : "none";
  loginStatus.textContent = text ?? "";
  loginError.style.display = "none";
}

function showError(msg) {
  const text = msg instanceof Error ? msg.message : String(msg);
  log.error(text);
  loginBtn.disabled = false;
  loginSpinner.style.display = "none";
  loginStatus.style.display = "none";
  loginError.style.display = "block";
  loginError.textContent = text;
}

function onLoginSuccess() {
  log.info("authentication successful — showing main UI");
  loginScreen.style.display = "none";
}

function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return Date.now() / 1000 >= payload.exp - TOKEN_EXPIRY_BUFFER_SEC;
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
      grant_type: "refresh_token",
      client_id: env.LOGIN_CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });
  const tokens = await res.json();
  if (!res.ok)
    throw new Error(
      tokens.error_description ?? tokens.error ?? "refresh failed",
    );
  return tokens;
}

async function exchangeCode(env, code) {
  const tokenUrl = `${env.LOGIN_URL}/realms/${env.LOGIN_REALM}/protocol/openid-connect/token`;
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.LOGIN_CLIENT_ID,
      redirect_uri: env.REDIRECT_URI,
      code,
    }),
  });
  const tokens = await res.json();
  if (!res.ok)
    throw new Error(
      tokens.error_description ?? tokens.error ?? "token exchange failed",
    );
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
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const loginUrl =
    `${env.LOGIN_URL}/realms/${env.LOGIN_REALM}/protocol/openid-connect/auth?` +
    new URLSearchParams({
      client_id: env.LOGIN_CLIENT_ID,
      redirect_uri: env.REDIRECT_URI,
      response_type: "code",
      scope: "openid offline_access",
      state,
      nonce,
    });
  setLoading("Đang mở trình duyệt để đăng nhập…");
  await window.scale.openLoginUrl(loginUrl);
  setLoading("Đang chờ đăng nhập trên trình duyệt…");
  const callbackParams = await waitForCallback();
  await window.scale.reloadWithCallback(callbackParams);
}

async function initAuth() {
  log.info("initAuth started");
  _env = await window.scale.getEnv();

  const envMissing =
    !_env.LOGIN_URL ||
    !_env.LOGIN_REALM ||
    !_env.LOGIN_CLIENT_ID ||
    !_env.REDIRECT_URI;
  if (envMissing && !_env.AUTH_REQUIRED) {
    log.warn("auth env vars missing and AUTH_REQUIRED=false — skipping authentication");
    return onLoginSuccess();
  }

  // expose login trigger for the home page button
  window.auth.startLogin = async () => {
    try { await startLoginFlow(_env); } catch (err) { showError(err); }
  };

  const storedCallback = sessionStorage.getItem("kcCallback");
  if (storedCallback) {
    sessionStorage.removeItem("kcCallback");
    log.info("exchanging authorization code for tokens");
    try {
      const { code } = Object.fromEntries(new URLSearchParams(storedCallback));
      const tokens = await exchangeCode(_env, code);
      currentTokens = tokens;
      await window.scale.saveTokens(tokens);
      scheduleProactiveRefresh();
      log.info("tokens saved");
      return onLoginSuccess();
    } catch (err) {
      log.error(`code exchange failed: ${err.message}`);
      await window.scale.clearTokens();
      showError(err);
      return;
    }
  }

  const stored = await window.scale.loadTokens();
  if (stored?.refresh_token) {
    if (!isTokenExpired(stored.refresh_token)) {
      log.info("stored refresh token is valid — attempting silent refresh");
      setLoading("Đang tiếp tục phiên làm việc…");
      try {
        const tokens = await refreshTokens(_env, stored.refresh_token);
        currentTokens = tokens;
        await window.scale.saveTokens(tokens);
        scheduleProactiveRefresh();
        log.info("silent refresh successful");
        return onLoginSuccess();
      } catch (err) {
        log.warn(
          `silent refresh failed (${err.message}) — falling back to login`,
        );
        await window.scale.clearTokens();
      }
    } else {
      log.warn(
        "stored refresh token is expired — clearing and re-authenticating",
      );
      await window.scale.clearTokens();
    }
  }

  log.info("no valid session — showing login button");
  // home page is already visible; user clicks Login to proceed
}

initAuth();
