// ── DATA SOURCE OAUTH 2.0 (PKCE) + REST CORE ────────────────────────────────
// Auth/config/token handling and the connection UI. Query building, record
// mapping, and the results/import UI live in js/datasource-query.js.

var DS_CONFIG_KEY = 'weave-ds-config';
var DS_TOKEN_KEY  = 'weave-ds-token';
var DS_PKCE_KEY   = 'weave-ds-pkce';   // sessionStorage — cleared on tab close

// ── CONFIG ─────────────────────────────────────────────────────────────────
function dsLoadConfig() {
  try { return JSON.parse(localStorage.getItem(DS_CONFIG_KEY)) || {}; }
  catch(e) { return {}; }
}
function dsSaveConfig(cfg) {
  localStorage.setItem(DS_CONFIG_KEY, JSON.stringify(cfg));
}

function dsNormalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/$/, '');
}

function dsResolveUrl(baseUrl, path, defaultPath) {
  var base = dsNormalizeBaseUrl(baseUrl);
  var rawPath = String(path || defaultPath || '').trim();
  if (/^https?:\/\//i.test(rawPath)) return rawPath;
  if (rawPath && rawPath.charAt(0) !== '/') rawPath = '/' + rawPath;
  return base + rawPath;
}

function dsSafeUrlForLog(url) {
  try {
    var u = new URL(String(url || ''));
    return u.origin + u.pathname;
  } catch(e) {
    return String(url || '').split('?')[0].split('#')[0];
  }
}

// ── TOKEN STORAGE ──────────────────────────────────────────────────────────
function dsSaveToken(data) {
  var token = {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token || null,
    expiresAt:    Date.now() + ((data.expires_in || 1800) * 1000) - 60000,
    scope:        data.scope || ''
  };
  localStorage.setItem(DS_TOKEN_KEY, JSON.stringify(token));
  return token;
}
function dsLoadToken() {
  try { return JSON.parse(localStorage.getItem(DS_TOKEN_KEY)); }
  catch(e) { return null; }
}
function dsClearToken() {
  localStorage.removeItem(DS_TOKEN_KEY);
  sessionStorage.removeItem(DS_PKCE_KEY);
}

// ── PKCE HELPERS ───────────────────────────────────────────────────────────
function dsB64url(buf) {
  var bytes = new Uint8Array(buf);
  var str = '';
  bytes.forEach(function(b) { str += String.fromCharCode(b); });
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function dsGenerateVerifier() {
  var arr = new Uint8Array(96);
  crypto.getRandomValues(arr);
  return dsB64url(arr);
}
function dsGenerateChallenge(verifier) {
  var enc = new TextEncoder();
  var data = enc.encode(verifier);
  return crypto.subtle.digest('SHA-256', data).then(function(hash) {
    return dsB64url(hash);
  });
}
function dsGenerateState() {
  var arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return dsB64url(arr);
}

// ── OAUTH FLOW ─────────────────────────────────────────────────────────────
function dsInitLogin() {
  var cfg = dsLoadConfig();
  if (!cfg.baseUrl || !cfg.clientId) {
    dsOpenConfig();
    return;
  }
  var verifier   = dsGenerateVerifier();
  dsGenerateChallenge(verifier).then(function(challenge) {
    var state       = dsGenerateState();
    var redirectUri = window.location.href.split('?')[0].split('#')[0];
    //var redirectUri = 'https://mark-enet.github.io/weave/';
    sessionStorage.setItem(DS_PKCE_KEY, JSON.stringify({
      verifier:    verifier,
      state:       state,
      redirectUri: redirectUri
    }));
    var authPath   = cfg.authPath;
    var params = new URLSearchParams({
      response_type:         'code',
      client_id:             cfg.clientId,
      redirect_uri:          redirectUri,
      state:                 state,
      code_challenge:        challenge,
      code_challenge_method: 'S256'
    });
    if (cfg.scope) params.set('scope', cfg.scope);
    window.location.href = dsResolveUrl(cfg.baseUrl, authPath, '/oauth_auth.do') + '?' + params.toString();
  });
}

function dsHandleCallback() {
  var params = new URLSearchParams(window.location.search);
  var code   = params.get('code');
  var state  = params.get('state');
  var error  = params.get('error');

  if (error) {
    // Validate against known OAuth error codes to avoid reflecting arbitrary input
    var knownErrors = ['access_denied','invalid_request','unauthorized_client',
      'unsupported_response_type','invalid_scope','server_error','temporarily_unavailable',
      'invalid_grant','unsupported_grant_type','invalid_client'];
    var safeError = knownErrors.indexOf(String(error)) !== -1 ? String(error) : 'unknown_error';
    appLog('error', 'Auth error: ' + safeError);
    history.replaceState(null, '', window.location.pathname);
    return Promise.resolve(false);
  }
  if (!code) return Promise.resolve(false);

  var pkce;
  try { pkce = JSON.parse(sessionStorage.getItem(DS_PKCE_KEY)); }
  catch(e) { pkce = null; }

  if (!pkce || pkce.state !== state) {
    appLog('error', 'OAuth state mismatch — possible CSRF');
    history.replaceState(null, '', window.location.pathname);
    return Promise.resolve(false);
  }

  var cfg       = dsLoadConfig();
  var tokenPath = cfg.tokenPath;
  var tokenUrl  = dsResolveUrl(cfg.baseUrl, tokenPath, '/oauth_token.do');
  var body = new URLSearchParams({
    grant_type:    'authorization_code',
    client_id:     cfg.clientId,
    code:          code,
    redirect_uri:  pkce.redirectUri,
    code_verifier: pkce.verifier
  });

  return fetch(tokenUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString()
  }).then(function(resp) {
    if (!resp.ok) {
      return resp.text().then(function(txt) {
        throw new Error('HTTP ' + resp.status + ' ' + resp.statusText + (txt ? ': ' + txt : ''));
      });
    }
    return resp.json();
  }).then(function(data) {
    dsSaveToken(data);
    sessionStorage.removeItem(DS_PKCE_KEY);
    history.replaceState(null, '', window.location.pathname);
    toast('Connected ✓', '✓');
    appLog('info', 'Connected to data source');
    dsUpdateBannerBtn();
    dsUpdatePanelStatus();
    return true;
  }).catch(function(e) {
    var msg = e && e.message ? e.message : String(e);
    var detail = e && e.stack ? e.stack : '';
    var isFetchNetworkError = (e instanceof TypeError) || /Failed to fetch|NetworkError/i.test(msg);
    detail = 'Token URL: ' + dsSafeUrlForLog(tokenUrl) + '\n' + (isFetchNetworkError ? 'This is usually a network/CORS/mixed-content issue, or an invalid token path/base URL.\n' : '') + detail;
    appLog('error', 'Auth failed: ' + msg, detail);
    history.replaceState(null, '', window.location.pathname);
    return false;
  });
}

function dsRefreshAccessToken() {
  var tok = dsLoadToken();
  if (!tok || !tok.refreshToken) return Promise.resolve(null);
  var cfg       = dsLoadConfig();
  var tokenPath = cfg.tokenPath;
  var tokenUrl  = dsResolveUrl(cfg.baseUrl, tokenPath, '/oauth_token.do');
  var body = new URLSearchParams({
    grant_type:    'refresh_token',
    client_id:     cfg.clientId,
    refresh_token: tok.refreshToken
  });
  return fetch(tokenUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString()
  }).then(function(resp) {
    if (!resp.ok) {
      return resp.text().then(function(txt) {
        throw new Error('HTTP ' + resp.status + ' ' + resp.statusText + (txt ? ': ' + txt : ''));
      });
    }
    return resp.json();
  }).then(function(data) {
    return dsSaveToken(data);
  }).catch(function(e) {
    var msg = e && e.message ? e.message : String(e);
    var detail = e && e.stack ? e.stack : '';
    var isFetchNetworkError = (e instanceof TypeError) || /Failed to fetch|NetworkError/i.test(msg);
    detail = 'Token URL: ' + dsSafeUrlForLog(tokenUrl) + '\n' + (isFetchNetworkError ? 'This is usually a network/CORS/mixed-content issue, or an invalid token path/base URL.\n' : '') + detail;
    appLog('warning', 'Token refresh failed — session ended: ' + msg, detail);
    dsClearToken();
    dsUpdateBannerBtn();
    dsUpdatePanelStatus();
    return null;
  });
}

function dsGetValidToken() {
  var tok = dsLoadToken();
  if (!tok) return Promise.resolve(null);
  if (Date.now() < tok.expiresAt) return Promise.resolve(tok.accessToken);
  return dsRefreshAccessToken().then(function(t) {
    return t ? t.accessToken : null;
  });
}

function dsLogout() {
  dsClearToken();
  dsUpdateBannerBtn();
  dsUpdatePanelStatus();
  dsCloseBannerMenu();
  toast('Disconnected', '✓');
  appLog('info', 'Disconnected from data source');
}

// ── REST API ───────────────────────────────────────────────────────────────
function dsApiGet(path, queryParams) {
  if (!path) {
    appLog('error', 'Data source query endpoint path is required');
    return Promise.reject(new Error('Data source endpoint path is required'));
  }
  var resolvedUrl = null;
  return dsGetValidToken().then(function(token) {
    if (!token) {
      appLog('warning', 'Not connected to data source');
      toast('Not connected to data source', '!');
      return null;
    }
    var cfg  = dsLoadConfig();
    var url  = dsResolveUrl(cfg.baseUrl, path, '');
    if (queryParams) {
      var qs = new URLSearchParams(queryParams).toString();
      if (qs) url += (url.indexOf('?') === -1 ? '?' : '&') + qs;
    }
    resolvedUrl = url;
    return fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept':        'application/json'
      }
    });
  }).then(function(resp) {
    if (!resp) return null;
    if (!resp.ok) {
      return resp.text().then(function(txt) {
        var err = new Error('HTTP ' + resp.status + ' ' + resp.statusText + (txt ? ': ' + txt : '') + (resolvedUrl ? ' [' + dsSafeUrlForLog(resolvedUrl) + ']' : ''));
        err._dsLogged = true;
        appLog('error', 'API request failed: ' + err.message, resolvedUrl ? 'URL: ' + dsSafeUrlForLog(resolvedUrl) : '');
        throw err;
      });
    }
    return resp.json();
  }).catch(function(e) {
    if (e && e._dsLogged) { throw e; }
    var msg = e && e.message ? e.message : String(e);
    var isFetchNetworkError = (e instanceof TypeError) || /Failed to fetch|NetworkError/i.test(msg);
    var detail = (resolvedUrl ? 'URL: ' + dsSafeUrlForLog(resolvedUrl) + '\n' : '') +
      (isFetchNetworkError ? 'This is usually a network/CORS/mixed-content issue.\n' : '') +
      (e && e.stack ? e.stack : '');
    appLog('error', 'API request failed: ' + msg, detail);
    throw e;
  });
}

// ── STATE HELPERS ──────────────────────────────────────────────────────────
function dsIsLoggedIn() {
  var tok = dsLoadToken();
  return !!(tok && tok.accessToken);
}

// ── BANNER BUTTON ──────────────────────────────────────────────────────────
function dsUpdateBannerBtn() {
  var btn = document.getElementById('ds-banner-btn');
  if (!btn) return;
  var loggedIn = dsIsLoggedIn();
  var cfg = dsLoadConfig();
  var label = loggedIn
    ? '<span class="ds-dot connected" title="Connected"></span>' + (cfg.label || 'Data Source')
    : (cfg.label || 'Data Source');
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<rect x="2" y="3" width="20" height="14" rx="2"/>' +
    '<path d="M8 21h8M12 17v4"/></svg>' +
    label;
  btn.title = loggedIn ? 'Connected to data source' : 'Connect to data source';
}

function dsBannerClick() {
  if (dsIsLoggedIn()) {
    var menu = document.getElementById('ds-menu');
    if (menu.style.display === 'block') {
      dsCloseBannerMenu();
    } else {
      menu.style.display = 'block';
    }
  } else {
    dsOpenConfig();
  }
}

function dsCloseBannerMenu() {
  var menu = document.getElementById('ds-menu');
  if (menu) menu.style.display = 'none';
}

// ── CONFIG MODAL ───────────────────────────────────────────────────────────
function dsOpenConfig() {
  var cfg = dsLoadConfig();
  document.getElementById('ds-base-url').value    = cfg.baseUrl    || '';
  document.getElementById('ds-client-id').value   = cfg.clientId   || '';
  document.getElementById('ds-scope').value       = cfg.scope      || '';
  document.getElementById('ds-auth-path').value   = cfg.authPath   || '/oauth_auth.do';
  document.getElementById('ds-token-path').value  = cfg.tokenPath  || '/oauth_token.do';
  document.getElementById('ds-label').value       = cfg.label      || '';
  var hint = document.getElementById('ds-redirect-uri-hint');
  if (hint) hint.textContent = window.location.href.split('?')[0].split('#')[0];
  //if (hint) hint.textContent = 'https://mark-enet.github.io/weave/';
  document.getElementById('ds-config-modal').classList.add('open');
}
function dsCloseConfig() {
  document.getElementById('ds-config-modal').classList.remove('open');
}
function dsSaveConfigUI() {
  var baseUrl   = document.getElementById('ds-base-url').value.trim();
  var clientId  = document.getElementById('ds-client-id').value.trim();
  var scope     = document.getElementById('ds-scope').value.trim();
  var authPath  = document.getElementById('ds-auth-path').value.trim() || '/oauth_auth.do';
  var tokenPath = document.getElementById('ds-token-path').value.trim() || '/oauth_token.do';
  var label     = document.getElementById('ds-label').value.trim();
  if (!baseUrl || !clientId) {
    toast('Base URL and Client ID are required', '!');
    return;
  }
  // Normalise base URL
  if (!/^https?:\/\//i.test(baseUrl)) baseUrl = 'https://' + baseUrl;
  baseUrl = baseUrl.replace(/\/$/, '');
  dsSaveConfig({ baseUrl: baseUrl, clientId: clientId, scope: scope,
                 authPath: authPath, tokenPath: tokenPath, label: label });
  dsCloseConfig();
  toast('Connection settings saved', '✓');
  appLog('info', 'Connection settings saved');
  dsUpdateBannerBtn();
}

// ── PANEL STATUS ───────────────────────────────────────────────────────────
function dsUpdatePanelStatus() {
  var statusEl  = document.getElementById('ds-panel-status');
  var formEl    = document.getElementById('ds-query-form');
  var loginEl   = document.getElementById('ds-panel-login');
  if (!statusEl) return;

  var loggedIn = dsIsLoggedIn();
  var cfg      = dsLoadConfig();

  if (loggedIn) {
    var instanceLabel = cfg.baseUrl || '';
    statusEl.innerHTML =
      '<span class="ds-dot connected"></span>' +
      '<span class="ds-status-text">Connected to <strong>' + esc(instanceLabel) + '</strong></span>';
    if (formEl)  formEl.style.display  = '';
    if (loginEl) loginEl.style.display = 'none';
  } else {
    statusEl.innerHTML = '<span class="ds-dot"></span><span class="ds-status-text">Not connected</span>';
    if (formEl)  formEl.style.display  = 'none';
    if (loginEl) loginEl.style.display = '';
  }
}

// ── CONFIG IMPORT / EXPORT ─────────────────────────────────────────────────
function dsExportConfig() {
  var cfg = dsLoadConfig();
  if (!cfg.baseUrl && !cfg.clientId) {
    toast('No data source configuration to export', '!');
    return;
  }
  var exportObj = {
    weaveDsConfig: true,
    label:     cfg.label     || '',
    baseUrl:   cfg.baseUrl   || '',
    clientId:  cfg.clientId  || '',
    scope:     cfg.scope     || '',
    authPath:  cfg.authPath  || '/oauth_auth.do',
    tokenPath: cfg.tokenPath || '/oauth_token.do'
  };
  promptExportFilename('weave-ds-config.json','Export Config',function(filename){
    var blob = new Blob([JSON.stringify(exportObj, null, 2)], {type: 'application/json'});
    triggerDownload(blob, filename);
    toast('Config exported', '↓');
    appLog('info', 'Data source config exported');
  });
}

function dsImportConfigClick() {
  document.getElementById('ds-config-file').click();
}

function dsImportConfigFile(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    try {
      var data = JSON.parse(ev.target.result);
      if (!data.weaveDsConfig) {
        appLog('error', 'Not a valid Weave data source config file');
        return;
      }
      if (!data.baseUrl || !data.clientId) {
        appLog('error', 'Config file is missing Base URL or Client ID');
        return;
      }
      dsSaveConfig({
        label:     data.label     || '',
        baseUrl:   data.baseUrl,
        clientId:  data.clientId,
        scope:     data.scope     || '',
        authPath:  data.authPath  || '/oauth_auth.do',
        tokenPath: data.tokenPath || '/oauth_token.do'
      });
      // Populate the modal fields so the user can see the imported values
      document.getElementById('ds-label').value      = data.label     || '';
      document.getElementById('ds-base-url').value   = data.baseUrl;
      document.getElementById('ds-client-id').value  = data.clientId;
      document.getElementById('ds-scope').value      = data.scope     || '';
      document.getElementById('ds-auth-path').value  = data.authPath  || '/oauth_auth.do';
      document.getElementById('ds-token-path').value = data.tokenPath || '/oauth_token.do';
      dsUpdateBannerBtn();
      toast('Config imported', '↑');
      appLog('info', 'Data source config imported');
    } catch(err) {
      appLog('error', 'Invalid config file', err && err.message ? err.message : String(err));
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ── INIT ───────────────────────────────────────────────────────────────────
function dsInit() {
  // Close menu when clicking outside
  document.addEventListener('click', function(e) {
    var menu = document.getElementById('ds-menu');
    if (!menu) return;
    var btn  = document.getElementById('ds-banner-btn');
    if (menu.style.display === 'block' &&
        !menu.contains(e.target) &&
        btn && !btn.contains(e.target)) {
      dsCloseBannerMenu();
    }
  });

  // Restore saved query form from localStorage (js/datasource-query.js)
  var savedQuery = dsLoadQueryLocal();
  if (savedQuery) dsPopulateQueryForm(savedQuery);

  // Handle OAuth callback (page loaded with ?code=...)
  if (window.location.search.indexOf('code=') !== -1 ||
      window.location.search.indexOf('error=') !== -1) {
    dsHandleCallback().then(function() {
      dsUpdateBannerBtn();
      dsUpdatePanelStatus();
    });
  } else {
    dsUpdateBannerBtn();
    dsUpdatePanelStatus();
  }
}
