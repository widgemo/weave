// ── DATA SOURCE OAUTH 2.0 (PKCE) + REST ─────────────────────────────────────

var DS_CONFIG_KEY = 'weave-ds-config';
var DS_TOKEN_KEY  = 'weave-ds-token';
var DS_PKCE_KEY   = 'weave-ds-pkce';   // sessionStorage — cleared on tab close
var DS_QUERY_KEY  = 'weave-ds-query';  // localStorage — persists query form state

// ── CONFIG ─────────────────────────────────────────────────────────────────
function dsLoadConfig() {
  try { return JSON.parse(localStorage.getItem(DS_CONFIG_KEY)) || {}; }
  catch(e) { return {}; }
}
function dsSaveConfig(cfg) {
  localStorage.setItem(DS_CONFIG_KEY, JSON.stringify(cfg));
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
    var base       = cfg.baseUrl.replace(/\/$/, '');
    var authPath   = cfg.authPath || '/oauth_auth.do';
    var params = new URLSearchParams({
      response_type:         'code',
      client_id:             cfg.clientId,
      redirect_uri:          redirectUri,
      state:                 state,
      code_challenge:        challenge,
      code_challenge_method: 'S256'
    });
    if (cfg.scope) params.set('scope', cfg.scope);
    window.location.href = base + authPath + '?' + params.toString();
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
    appLog('error', 'OAuth state mismatch \u2014 possible CSRF');
    history.replaceState(null, '', window.location.pathname);
    return Promise.resolve(false);
  }

  var cfg       = dsLoadConfig();
  var base      = cfg.baseUrl.replace(/\/$/, '');
  var tokenPath = cfg.tokenPath || '/oauth_token.do';
  var body = new URLSearchParams({
    grant_type:    'authorization_code',
    client_id:     cfg.clientId,
    code:          code,
    redirect_uri:  pkce.redirectUri,
    code_verifier: pkce.verifier
  });

  return fetch(base + tokenPath, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString()
  }).then(function(resp) {
    if (!resp.ok) {
      return resp.text().then(function(txt) { throw new Error(txt); });
    }
    return resp.json();
  }).then(function(data) {
    dsSaveToken(data);
    sessionStorage.removeItem(DS_PKCE_KEY);
    history.replaceState(null, '', window.location.pathname);
    toast('Connected \u2713', '\u2713');
    appLog('info', 'Connected to data source');
    dsUpdateBannerBtn();
    dsUpdatePanelStatus();
    return true;
  }).catch(function(e) {
    appLog('error', 'Auth failed: ' + e.message, e.stack || '');
    history.replaceState(null, '', window.location.pathname);
    return false;
  });
}

function dsRefreshAccessToken() {
  var tok = dsLoadToken();
  if (!tok || !tok.refreshToken) return Promise.resolve(null);
  var cfg       = dsLoadConfig();
  var base      = cfg.baseUrl.replace(/\/$/, '');
  var tokenPath = cfg.tokenPath || '/oauth_token.do';
  var body = new URLSearchParams({
    grant_type:    'refresh_token',
    client_id:     cfg.clientId,
    refresh_token: tok.refreshToken
  });
  return fetch(base + tokenPath, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString()
  }).then(function(resp) {
    if (!resp.ok) throw new Error('refresh failed');
    return resp.json();
  }).then(function(data) {
    return dsSaveToken(data);
  }).catch(function(e) {
    appLog('warning', 'Token refresh failed — session ended', e && e.message ? e.message : '');
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
  toast('Disconnected', '\u2713');
  appLog('info', 'Disconnected from data source');
}

// ── REST API ───────────────────────────────────────────────────────────────
function dsApiGet(path, queryParams) {
  return dsGetValidToken().then(function(token) {
    if (!token) {
      appLog('warning', 'Not connected to data source');
      toast('Not connected to data source', '!');
      return null;
    }
    var cfg  = dsLoadConfig();
    var base = cfg.baseUrl.replace(/\/$/, '');
    var url  = base + path;
    if (queryParams) {
      url += '?' + new URLSearchParams(queryParams).toString();
    }
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
        throw new Error(resp.status + ': ' + txt);
      });
    }
    return resp.json();
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
  toast('Connection settings saved', '\u2713');
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

// ── QUERY PANEL ────────────────────────────────────────────────────────────
function dsRunQuery() {
  var endpoint          = document.getElementById('ds-endpoint').value.trim();
  var queryStr          = document.getElementById('ds-query').value.trim();
  var descField         = document.getElementById('ds-desc-field').value.trim();
  var sysField          = document.getElementById('ds-sys-field').value.trim();
  var actorField        = document.getElementById('ds-actor-field').value.trim();
  var tsField           = document.getElementById('ds-ts-field').value.trim();
  var eventCodeField    = document.getElementById('ds-event-code-field').value.trim();
  var levelField        = document.getElementById('ds-level-field').value.trim();
  var integCodeField    = document.getElementById('ds-integration-code-field').value.trim();
  var intCfg = {
    field:       document.getElementById('ds-interactions-field').value.trim(),
    targetField: document.getElementById('ds-int-target-field').value.trim(),
    natureField: document.getElementById('ds-int-nature-field').value.trim(),
    labelField:  document.getElementById('ds-int-label-field').value.trim(),
    delayField:  document.getElementById('ds-int-delay-field').value.trim(),
    orderField:  document.getElementById('ds-int-order-field').value.trim()
  };

  if (!endpoint) { toast('Endpoint path is required', '!'); return; }

  // Auto-save query form to localStorage
  dsSaveQueryLocal();
  var params = {};
  if (queryStr) {
    queryStr.split('&').forEach(function(pair) {
      var idx = pair.indexOf('=');
      if (idx > 0) {
        var k = pair.slice(0, idx).trim();
        var v = pair.slice(idx + 1).trim();
        if (k) params[k] = v;
      }
    });
  }

  var statusEl  = document.getElementById('ds-query-status');
  var resultsEl = document.getElementById('ds-results');
  statusEl.textContent = 'Querying\u2026';
  document.getElementById('ds-import-all-btn').style.display = 'none';
  resultsEl.innerHTML = '';
  resultsEl._records = null;

  dsApiGet(endpoint, params)
    .then(function(data) {
      if (!data) { statusEl.textContent = ''; return; }
      // Support {result:[...]}, {data:[...]}, {records:[...]}, {items:[...]}, or a bare array
      var records = Array.isArray(data)
        ? data
        : (data.result || data.data || data.records || data.items || []);
      statusEl.textContent = records.length + ' record(s) returned';
      dsShowResults(records, descField, sysField, actorField, tsField, eventCodeField, levelField, integCodeField, intCfg);
    })
    .catch(function(e) {
      statusEl.textContent = 'Error: ' + e.message;
      appLog('error', 'Query failed: ' + e.message, e.stack || '');
    });
}

function dsGetFieldVal(rec, field) {
  if (!field) return '';
  var v = rec[field];
  if (!v) return '';
  return (typeof v === 'object' && v.display_value != null) ? v.display_value : String(v);
}

// Extract a human-readable description from a record
function dsGetRecordDesc(rec, descField, fallback) {
  if (descField) {
    var dv = dsGetFieldVal(rec, descField);
    if (dv) return dv;
  }
  // Generic fallbacks across common API conventions
  var raw = rec.short_description || rec.description || rec.name || rec.title ||
            rec.label || rec.number || rec.id || rec.sys_id || fallback || '(record)';
  return (typeof raw === 'object' && raw.display_value != null) ? raw.display_value : String(raw);
}

// Generate a cryptographically random hex suffix for IDs
function dsRandomSuffix() {
  var arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}

function dsShowResults(records, descField, sysField, actorField, tsField, eventCodeField, levelField, integCodeField, intCfg) {
  var el = document.getElementById('ds-results');
  el._records          = records;
  el._descField        = descField;
  el._sysField         = sysField;
  el._actorField       = actorField;
  el._tsField          = tsField;
  el._eventCodeField   = eventCodeField  || '';
  el._levelField       = levelField      || '';
  el._integCodeField   = integCodeField  || '';
  el._intCfg           = intCfg          || {};

  if (!records.length) {
    el.innerHTML = '<div class="hint" style="padding:8px 0">No records found.</div>';
    return;
  }
  var html = '<div class="ds-result-list">';
  records.forEach(function(rec, i) {
    var desc  = dsGetRecordDesc(rec, descField, '(record ' + (i + 1) + ')');
    var sys   = sysField   ? dsGetFieldVal(rec, sysField)   : '';
    var actor = actorField ? dsGetFieldVal(rec, actorField) : '';
    var ts    = tsField    ? dsGetFieldVal(rec, tsField)    : '';
    html += '<div class="ds-result-item" id="dsri-' + i + '">';
    html += '<div class="ds-result-desc">' + esc(desc) + '</div>';
    html += '<div class="ds-result-meta">';
    if (sys)   html += '<span class="ds-result-sys">' + esc(sys) + '</span>';
    if (actor) html += '<span class="ds-result-actor">' + esc(actor) + '</span>';
    if (ts)    html += '<span class="ds-result-ts">' + esc(ts) + '</span>';
    html += '</div>';
    html += '<button class="btn btn-outline btn-sm ds-add-btn" id="ds-add-' + i + '" onclick="dsImportRecord(' + i + ')">+ Add</button>';
    html += '</div>';
  });
  html += '</div>';
  el.innerHTML = html;
  document.getElementById('ds-import-all-btn').style.display = 'inline-flex';
}

function dsImportRecord(idx) {
  var el  = document.getElementById('ds-results');
  var rec = (el._records || [])[idx];
  if (!rec) return;
  dsRecordToEvent(rec, el._descField, el._sysField, el._actorField, el._tsField, el._eventCodeField, el._levelField, el._integCodeField, el._intCfg);
  var item = document.getElementById('dsri-' + idx);
  var btn  = document.getElementById('ds-add-' + idx);
  if (item) item.classList.add('ds-imported');
  if (btn)  { btn.textContent = '\u2713 Added'; btn.disabled = true; }
}

function dsImportAll() {
  var el      = document.getElementById('ds-results');
  var records = el._records || [];
  if (!records.length) return;
  records.forEach(function(rec, i) {
    dsRecordToEvent(rec, el._descField, el._sysField, el._actorField, el._tsField, el._eventCodeField, el._levelField, el._integCodeField, el._intCfg);
    var item = document.getElementById('dsri-' + i);
    var btn  = document.getElementById('ds-add-' + i);
    if (item) item.classList.add('ds-imported');
    if (btn)  { btn.textContent = '\u2713 Added'; btn.disabled = true; }
  });
  document.getElementById('ds-import-all-btn').style.display = 'none';
  toast(records.length + ' record(s) imported', '\u2191');
  appLog('info', records.length + ' record(s) imported from data source');
}

function dsRecordToEvent(rec, descField, sysField, actorField, tsField, eventCodeField, levelField, integCodeField, intCfg) {
  var desc      = dsGetRecordDesc(rec, descField);
  var sys       = sysField        ? dsGetFieldVal(rec, sysField)        : '';
  var actor     = actorField      ? dsGetFieldVal(rec, actorField)      : '';
  var tsRaw     = tsField         ? dsGetFieldVal(rec, tsField)         : '';
  var eventCode = eventCodeField  ? dsGetFieldVal(rec, eventCodeField)  : '';
  var level     = levelField      ? dsGetFieldVal(rec, levelField)      : '';
  var integCode = integCodeField  ? dsGetFieldVal(rec, integCodeField)  : '';
  var tsMs   = null;
  if (tsRaw !== null && tsRaw !== undefined && tsRaw !== '') {
    // Handle numeric epoch timestamps (ms if >= 1e10, seconds otherwise)
    var numVal = typeof tsRaw === 'number' ? tsRaw : (String(tsRaw).match(/^\d+(\.\d+)?$/) ? parseFloat(tsRaw) : NaN);
    if (!isNaN(numVal) && numVal > 0) {
      tsMs = numVal >= 1e10 ? numVal : numVal * 1000;
    } else {
      // Handle both 'YYYY-MM-DD HH:MM:SS' and ISO 8601 formats
      var normalized = String(tsRaw).replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/, '$1T$2');
      var d = new Date(normalized);
      if (!isNaN(d.getTime())) tsMs = d.getTime();
    }
  }
  var tsStr = tsMs ? new Date(tsMs).toISOString() : null;
  var interactions = [];
  var cfg = intCfg || {};
  if (cfg.field) {
    var rawInts = rec[cfg.field];
    if (Array.isArray(rawInts)) {
      var validNatures = ['push', 'pull', 'process'];
      rawInts.forEach(function(intRec, idx) {
        var target = cfg.targetField ? dsGetFieldVal(intRec, cfg.targetField) : '';
        var nature = cfg.natureField ? dsGetFieldVal(intRec, cfg.natureField) : '';
        var label  = cfg.labelField  ? dsGetFieldVal(intRec, cfg.labelField)  : '';
        var delay  = cfg.delayField  ? dsGetFieldVal(intRec, cfg.delayField)  : '';
        var order  = cfg.orderField  ? dsGetFieldVal(intRec, cfg.orderField)  : '';
        if (!target) return;
        // Default to 'push' when nature is missing or unrecognised
        var normNature = validNatures.indexOf(nature) !== -1 ? nature : 'push';
        var orderNum   = order !== '' ? (parseInt(order, 10) || idx) : idx;
        interactions.push({
          target: target || '',
          nature: normNature,
          label:  label  || '',
          delay:  delay  || '',
          order:  orderNum
        });
        if (target) knownSys.add(target);
      });
    }
  }
  var ev = {
    _id:                      'ds-' + Date.now() + '-' + dsRandomSuffix(),
    desc:                     desc,
    system:                   sys       || '',
    actor:                    actor     || '',
    timestamp:                tsMs,
    timestampStr:             tsStr,
    eventCode:                eventCode || '',
    level:                    normalizeLevel(level),
    managedIntegrationCode:   integCode || '',
    interactions:             interactions,
    mode:                     appMode
  };
  events.push(ev);
  if (ev.system) {
    knownSys.add(ev.system);
    if (!systemsRegistry.find(function(s){return s.name===ev.system;}))
      systemsRegistry.push({name: ev.system, desc: '', order: undefined});
  }
  interactions.forEach(function(i) {
    if (i.target && !systemsRegistry.find(function(s){return s.name===i.target;}))
      systemsRegistry.push({name: i.target, desc: '', order: undefined});
  });
  if (ev.actor && !actorsRegistry.find(function(a){return a.name===ev.actor;}))
    actorsRegistry.push({name: ev.actor, desc: ''});
  refreshDL();
  render();
  updateList();
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
  var blob = new Blob([JSON.stringify(exportObj, null, 2)], {type: 'application/json'});
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href     = url;
  a.download = 'weave-ds-config.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('Config exported', '\u2193');
  appLog('info', 'Data source config exported');
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
      toast('Config imported', '\u2191');
      appLog('info', 'Data source config imported');
    } catch(err) {
      appLog('error', 'Invalid config file', err && err.message ? err.message : String(err));
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ── QUERY IMPORT / EXPORT ──────────────────────────────────────────────────
function dsReadQueryForm() {
  return {
    endpoint:           (document.getElementById('ds-endpoint').value                 || '').trim(),
    queryParams:        (document.getElementById('ds-query').value                    || '').trim(),
    descField:          (document.getElementById('ds-desc-field').value               || '').trim(),
    sysField:           (document.getElementById('ds-sys-field').value                || '').trim(),
    actorField:         (document.getElementById('ds-actor-field').value              || '').trim(),
    tsField:            (document.getElementById('ds-ts-field').value                 || '').trim(),
    eventCodeField:     (document.getElementById('ds-event-code-field').value         || '').trim(),
    levelField:         (document.getElementById('ds-level-field').value              || '').trim(),
    integCodeField:     (document.getElementById('ds-integration-code-field').value   || '').trim(),
    interactionsField:  (document.getElementById('ds-interactions-field').value       || '').trim(),
    intTargetField:     (document.getElementById('ds-int-target-field').value         || '').trim(),
    intNatureField:     (document.getElementById('ds-int-nature-field').value         || '').trim(),
    intLabelField:      (document.getElementById('ds-int-label-field').value          || '').trim(),
    intDelayField:      (document.getElementById('ds-int-delay-field').value          || '').trim(),
    intOrderField:      (document.getElementById('ds-int-order-field').value          || '').trim()
  };
}

function dsPopulateQueryForm(q) {
  document.getElementById('ds-endpoint').value                    = q.endpoint           || '';
  document.getElementById('ds-query').value                       = q.queryParams        || '';
  document.getElementById('ds-desc-field').value                  = q.descField          || '';
  document.getElementById('ds-sys-field').value                   = q.sysField           || '';
  document.getElementById('ds-actor-field').value                 = q.actorField         || '';
  document.getElementById('ds-ts-field').value                    = q.tsField            || '';
  document.getElementById('ds-event-code-field').value            = q.eventCodeField     || '';
  document.getElementById('ds-level-field').value                 = q.levelField         || '';
  document.getElementById('ds-integration-code-field').value      = q.integCodeField     || '';
  document.getElementById('ds-interactions-field').value          = q.interactionsField  || '';
  document.getElementById('ds-int-target-field').value            = q.intTargetField     || '';
  document.getElementById('ds-int-nature-field').value            = q.intNatureField     || '';
  document.getElementById('ds-int-label-field').value             = q.intLabelField      || '';
  document.getElementById('ds-int-delay-field').value             = q.intDelayField      || '';
  document.getElementById('ds-int-order-field').value             = q.intOrderField      || '';
}

function dsSaveQueryLocal() {
  try { localStorage.setItem(DS_QUERY_KEY, JSON.stringify(dsReadQueryForm())); } catch(e) {}
}

function dsLoadQueryLocal() {
  try { return JSON.parse(localStorage.getItem(DS_QUERY_KEY)) || null; } catch(e) { return null; }
}

function dsIsQueryEmpty(q) {
  return !q.endpoint && !q.queryParams && !q.descField && !q.sysField && !q.actorField &&
         !q.tsField && !q.eventCodeField && !q.levelField && !q.integCodeField &&
         !q.interactionsField;
}

function dsExportQuery() {
  var q = dsReadQueryForm();
  if (dsIsQueryEmpty(q)) {
    toast('No query to export', '!');
    return;
  }
  var fieldMap = {
    desc:            q.descField,
    system:          q.sysField,
    actor:           q.actorField,
    timestamp:       q.tsField,
    eventCode:       q.eventCodeField,
    level:           q.levelField,
    integrationCode: q.integCodeField,
    interactions: {
      field:       q.interactionsField,
      targetField: q.intTargetField,
      natureField: q.intNatureField,
      labelField:  q.intLabelField,
      delayField:  q.intDelayField,
      orderField:  q.intOrderField
    }
  };
  var exportObj = { weaveDsQuery: true, endpoint: q.endpoint, queryParams: q.queryParams, fieldMap: fieldMap };
  var blob = new Blob([JSON.stringify(exportObj, null, 2)], {type: 'application/json'});
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href     = url;
  a.download = 'weave-ds-query.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('Query exported', '\u2193');
  appLog('info', 'Query config exported');
}

function dsImportQueryClick() {
  document.getElementById('ds-query-file').click();
}

function dsImportQueryFile(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    try {
      var data = JSON.parse(ev.target.result);
      if (!data.weaveDsQuery) {
        appLog('error', 'Not a valid Weave query file');
        return;
      }
      var fm = data.fieldMap || {};
      var intFm = fm.interactions || {};
      dsPopulateQueryForm({
        endpoint:          data.endpoint    || '',
        queryParams:       data.queryParams || '',
        descField:         fm.desc          || '',
        sysField:          fm.system        || '',
        actorField:        fm.actor         || '',
        tsField:           fm.timestamp     || '',
        eventCodeField:    fm.eventCode     || '',
        levelField:        fm.level         || '',
        integCodeField:    fm.integrationCode || '',
        interactionsField: intFm.field       || '',
        intTargetField:    intFm.targetField  || '',
        intNatureField:    intFm.natureField  || '',
        intLabelField:     intFm.labelField   || '',
        intDelayField:     intFm.delayField   || '',
        intOrderField:     intFm.orderField   || ''
      });
      dsSaveQueryLocal();
      toast('Query imported', '\u2191');
      appLog('info', 'Query config imported');
    } catch(err) {
      appLog('error', 'Invalid query file', err && err.message ? err.message : String(err));
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

  // Restore saved query form from localStorage
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
