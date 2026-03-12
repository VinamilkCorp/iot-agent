const REDIRECT_URI = "iotscale://auth";

const loginScreen = document.getElementById("login-screen");
const loginStatus = document.getElementById("login-status");
const loginError = document.getElementById("login-error");

const log = {
  info: (msg) => console.log(`[auth] ${msg}`),
  warn: (msg) => console.warn(`[auth] ${msg}`),
  error: (msg) => console.error(`[auth] ${msg}`),
};

function showError(err) {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : JSON.stringify(err);
  log.error(msg);
  loginStatus.style.display = "none";
  loginError.style.display = "block";
  loginError.textContent = msg;
}

function waitForCallback() {
  log.info("registering auth-callback listener");
  return new Promise((resolve) => {
    window.scale.onAuthCallback((url) => {
      log.info(`auth-callback received — url=${url}`);
      resolve(url);
    });
  });
}

function onLoginSuccess() {
  log.info("authentication successful — showing main UI");
  loginScreen.style.display = "none";
}

async function initAuth() {
  log.info("initAuth started");
  const env = await window.scale.getEnv();

  // Case 1: returning from external browser with stored callback params
  const storedCallback = sessionStorage.getItem("kcCallback");
  if (storedCallback) {
    log.info("found stored callback params, exchanging code for tokens");
    sessionStorage.removeItem("kcCallback");
    try {
      const params = Object.fromEntries(new URLSearchParams(storedCallback));
      const tokenUrl = `${env.LOGIN_URL}/realms/${env.LOGIN_REALM}/protocol/openid-connect/token`;
      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: env.LOGIN_CLIENT_ID,
          redirect_uri: REDIRECT_URI,
          code: params.code,
        }),
      });
      const tokens = await res.json();
      if (!res.ok)
        throw new Error(
          tokens.error_description ?? tokens.error ?? "token exchange failed",
        );
      log.info("token exchange successful");
      sessionStorage.setItem("kcTokens", JSON.stringify(tokens));
      return onLoginSuccess();
    } catch (err) {
      log.error(`token exchange error: ${err}`);
    }
  }

  // Case 2: fresh start — build login URL, open external browser, wait for deep-link callback
  log.info("no pending callback — starting fresh login flow");
  try {
    const state = crypto.randomUUID();
    const nonce = crypto.randomUUID();
    const loginUrl =
      `${env.LOGIN_URL}/realms/${env.LOGIN_REALM}/protocol/openid-connect/auth?` +
      new URLSearchParams({
        client_id: env.LOGIN_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: "code",
        scope: "openid",
        state,
        nonce,
      });
    loginStatus.textContent = "Opening browser for login…";
    await window.scale.openLoginUrl(loginUrl);
    loginStatus.textContent = "Waiting for login in browser…";

    const callbackUrl = await waitForCallback();
    log.info(`callback received — url=${callbackUrl}`);
    const cbUrl = new URL(callbackUrl);
    const cbParams = cbUrl.hash.substring(1) || cbUrl.search.substring(1);
    log.info(`storing callback params and reloading: ${cbParams}`);
    await window.scale.reloadWithCallback(cbParams);
  } catch (err) {
    showError(err);
  }
}

initAuth();
