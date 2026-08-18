// ── IN-UI LOGGER ─────────────────────────────────────────────────────────────
// Stores structured log entries in memory. Does NOT use console.log.
// Entries: { ts: Date, level: 'info'|'warning'|'error', msg: string, detail: string }

var appLogEntries = [];
var _logBadgeCount = 0;

// Add a log entry and update the UI badge.
// level: 'info' | 'warning' | 'error'
// msg:   short human-readable message
// detail: optional longer detail string (e.g. server response body, stack)
function appLog(level, msg, detail) {
  var entry = { ts: new Date(), level: level, msg: msg || '', detail: detail || '' };
  appLogEntries.push(entry);
  _logBadgeCount++;
  _logUpdateBadge();
  if (level === 'error') {
    showErrorBanner(msg);
  }
}

function _logUpdateBadge() {
  var badge = document.getElementById('log-badge');
  if (!badge) return;
  if (_logBadgeCount > 0) {
    badge.textContent = _logBadgeCount > 99 ? '99+' : String(_logBadgeCount);
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

// ── ERROR BANNER ──────────────────────────────────────────────────────────────
// Prominent red top-centered banner that the user must explicitly dismiss.

function showErrorBanner(msg) {
  var banner = document.getElementById('error-banner');
  var msgEl  = document.getElementById('error-banner-msg');
  if (!banner || !msgEl) return;
  msgEl.textContent = msg || 'An error occurred.';
  banner.style.display = 'flex';
  // Briefly animate in
  banner.classList.remove('error-banner-in');
  // Force reflow so the transition fires
  void banner.offsetWidth;
  banner.classList.add('error-banner-in');
}

function dismissErrorBanner() {
  var banner = document.getElementById('error-banner');
  if (banner) banner.style.display = 'none';
}

// ── LOG VIEWER ────────────────────────────────────────────────────────────────

function openLogViewer() {
  _logBadgeCount = 0;
  _logUpdateBadge();
  _renderLogViewer();
  document.getElementById('log-modal').classList.add('open');
}

function closeLogViewer() {
  document.getElementById('log-modal').classList.remove('open');
}

function clearAppLog() {
  appLogEntries = [];
  _logBadgeCount = 0;
  _logUpdateBadge();
  _renderLogViewer();
}

function _renderLogViewer() {
  var el = document.getElementById('log-list');
  if (!el) return;
  if (!appLogEntries.length) {
    el.innerHTML = '<div class="log-empty">No log entries yet.</div>';
    return;
  }
  // Allowlist level values before interpolating into class attributes
  var _VALID_LEVELS = {info:1, warning:1, error:1};
  // Render newest first
  var html = '';
  for (var i = appLogEntries.length - 1; i >= 0; i--) {
    var e = appLogEntries[i];
    var lvl = _VALID_LEVELS[e.level] ? e.level : 'info';
    var tstr = _logFmtTime(e.ts);
    html += '<div class="log-entry log-entry-' + lvl + '">';
    html += '<div class="log-entry-header">';
    html += '<span class="log-entry-badge log-badge-' + lvl + '">' + lvl.toUpperCase() + '</span>';
    html += '<span class="log-entry-ts">' + esc(tstr) + '</span>';
    html += '</div>';
    html += '<div class="log-entry-msg">' + esc(e.msg) + '</div>';
    if (e.detail) {
      html += '<div class="log-entry-detail">' + esc(e.detail) + '</div>';
    }
    html += '</div>';
  }
  el.innerHTML = html;
}

function _logFmtTime(d) {
  if (!d) return '';
  var pad = function(n){return n<10?'0'+n:String(n);};
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+
    ' '+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());
}
