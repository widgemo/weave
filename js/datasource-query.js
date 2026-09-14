// ── DATA SOURCE QUERY & RECORD MAPPING ──────────────────────────────────────
// Query form handling, results list, and mapping a fetched record onto a
// diagram event. OAuth/token/config core lives in js/datasource-auth.js.

var DS_QUERY_KEY  = 'weave-ds-query';  // localStorage — persists query form state
var dsPagingOffset = 0; // current offset for Prev/Next; reset on every fresh Run Query

// ── FIELD MAPPING ────────────────────────────────────────────────────────
// Reads the mapping form into a single config object, replacing the old
// 8-positional-argument signature shared by dsShowResults/dsRecordToEvent.
function dsReadFieldMapping() {
  return {
    descField:       document.getElementById('ds-desc-field').value.trim(),
    sysField:        document.getElementById('ds-sys-field').value.trim(),
    actorField:      document.getElementById('ds-actor-field').value.trim(),
    tsField:         document.getElementById('ds-ts-field').value.trim(),
    eventCodeField:  document.getElementById('ds-event-code-field').value.trim(),
    levelField:      document.getElementById('ds-level-field').value.trim(),
    integCodeField:  document.getElementById('ds-integration-code-field').value.trim(),
    intCfg: {
      field:       document.getElementById('ds-interactions-field').value.trim(),
      targetField: document.getElementById('ds-int-target-field').value.trim(),
      natureField: document.getElementById('ds-int-nature-field').value.trim(),
      labelField:  document.getElementById('ds-int-label-field').value.trim(),
      delayField:  document.getElementById('ds-int-delay-field').value.trim(),
      orderField:  document.getElementById('ds-int-order-field').value.trim()
    }
  };
}

// Pure: given a raw record + field-mapping config, compute the would-be
// event fields. No side effects (no events.push, no registry/render calls)
// so it's safely reusable by the result cards, the live preview, and the
// real import path. `valid` reflects the one field saveEvent() actually
// requires (system).
function dsMapRecordFields(rec, fm) {
  fm = fm || {};
  var desc      = dsGetRecordDesc(rec, fm.descField);
  var sys       = fm.sysField       ? dsGetFieldVal(rec, fm.sysField)       : '';
  var actor     = fm.actorField     ? dsGetFieldVal(rec, fm.actorField)     : '';
  var tsRaw     = fm.tsField        ? dsGetFieldVal(rec, fm.tsField)        : '';
  var eventCode = fm.eventCodeField ? dsGetFieldVal(rec, fm.eventCodeField) : '';
  var level     = fm.levelField     ? dsGetFieldVal(rec, fm.levelField)     : '';
  var integCode = fm.integCodeField ? dsGetFieldVal(rec, fm.integCodeField) : '';
  var tsMs = null;
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
  var cfg = fm.intCfg || {};
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
      });
    }
  }
  return {
    desc:                    desc,
    system:                  sys       || '',
    actor:                   actor     || '',
    tsRaw:                   tsRaw     || '',
    timestamp:               tsMs,
    timestampStr:            tsStr,
    eventCode:                eventCode || '',
    level:                   normalizeLevel(level),
    managedIntegrationCode:  integCode || '',
    interactions:            interactions,
    valid:                   !!(sys || '')
  };
}

// ── QUERY PANEL ────────────────────────────────────────────────────────────
function dsBuildParams(queryStr, offsetParamName, offset) {
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
  if (offsetParamName) params[offsetParamName] = String(offset || 0);
  return params;
}

// Single funnel both a fresh "Run Query" click and Prev/Next go through.
function dsExecuteQuery(endpoint, queryStr, offset, fm) {
  var offsetParamName = document.getElementById('ds-offset-param').value.trim();
  var pageSize = parseInt(document.getElementById('ds-page-size').value, 10) || 20;
  var params = dsBuildParams(queryStr, offsetParamName, offset);

  var statusEl  = document.getElementById('ds-query-status');
  var resultsEl = document.getElementById('ds-results');
  statusEl.textContent = 'Querying…';
  document.getElementById('ds-import-all-btn').style.display = 'none';
  dsHideQueryError();
  resultsEl.innerHTML = '';
  resultsEl._records = null;

  dsApiGet(endpoint, params)
    .then(function(data) {
      if (!data) {
        statusEl.textContent = '';
        dsShowQueryError('Not connected to data source. Click "Login" above, then try again.', true);
        dsUpdatePagingControls(offsetParamName, pageSize, offset, 0);
        return;
      }
      // Support {result:[...]}, {data:[...]}, {records:[...]}, {items:[...]}, or a bare array
      var records = Array.isArray(data)
        ? data
        : (data.result || data.data || data.records || data.items || []);
      statusEl.textContent = records.length + ' record(s) returned';
      dsPagingOffset = offset;
      dsShowResults(records, fm);
      dsUpdatePagingControls(offsetParamName, pageSize, offset, records.length);
    })
    .catch(function(e) {
      statusEl.textContent = 'Error';
      dsShowQueryError(e && e.message ? e.message : String(e), false);
      dsUpdatePagingControls(offsetParamName, pageSize, offset, 0);
    });
}

function dsRunQuery() {
  var endpoint = document.getElementById('ds-endpoint').value.trim();
  var queryStr = document.getElementById('ds-query').value.trim();
  if (!endpoint) { toast('Endpoint path is required', '!'); return; }
  var fm = dsReadFieldMapping();
  dsSaveQueryLocal();
  dsPagingOffset = 0; // a fresh Run Query always resets paging
  dsExecuteQuery(endpoint, queryStr, 0, fm);
}

function dsNextPage() {
  var endpoint  = document.getElementById('ds-endpoint').value.trim();
  var queryStr  = document.getElementById('ds-query').value.trim();
  var pageSize  = parseInt(document.getElementById('ds-page-size').value, 10) || 20;
  dsExecuteQuery(endpoint, queryStr, dsPagingOffset + pageSize, dsReadFieldMapping());
}

function dsPrevPage() {
  var endpoint  = document.getElementById('ds-endpoint').value.trim();
  var queryStr  = document.getElementById('ds-query').value.trim();
  var pageSize  = parseInt(document.getElementById('ds-page-size').value, 10) || 20;
  dsExecuteQuery(endpoint, queryStr, Math.max(0, dsPagingOffset - pageSize), dsReadFieldMapping());
}

function dsUpdatePagingControls(offsetParamName, pageSize, currentOffset, recordCount) {
  var wrap = document.getElementById('ds-paging');
  if (!wrap) return;
  if (!offsetParamName) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'flex';
  document.getElementById('ds-prev-btn').disabled = currentOffset <= 0;
  document.getElementById('ds-next-btn').disabled = recordCount < pageSize;
  document.getElementById('ds-page-info').textContent = 'Offset ' + currentOffset;
}

// ── INLINE QUERY ERROR/WARNING ──────────────────────────────────────────
function dsShowQueryError(msg, isWarning) {
  var el = document.getElementById('ds-query-error');
  if (!el) return;
  el.className = 'ds-query-error' + (isWarning ? ' ds-query-warn' : '');
  el.innerHTML = '<span class="ds-query-error-icon">&#9888;</span><span>' + esc(msg) + '</span>';
  el.style.display = 'flex';
}
function dsHideQueryError() {
  var el = document.getElementById('ds-query-error');
  if (el) { el.style.display = 'none'; el.innerHTML = ''; }
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

// ── FIELD-NAME AUTOCOMPLETE + LIVE PREVIEW ──────────────────────────────
function dsPopulateFieldDatalist(records) {
  var dl = document.getElementById('ds-field-dl');
  if (!dl) return;
  var keys = {};
  var lim = Math.min(records.length, 200);
  for (var i = 0; i < lim; i++) {
    var rec = records[i];
    if (rec && typeof rec === 'object') {
      for (var k in rec) if (Object.prototype.hasOwnProperty.call(rec, k)) keys[k] = true;
    }
  }
  var html = '';
  Object.keys(keys).sort().forEach(function(k) { html += '<option value="' + esc(k) + '">'; });
  dl.innerHTML = html; // also clears stale options when a new query returns 0 records
}

function dsUpdatePreview() {
  var wrap = document.getElementById('ds-preview');
  var body = document.getElementById('ds-preview-body');
  if (!wrap || !body) return;
  var resultsEl = document.getElementById('ds-results');
  var records = resultsEl && resultsEl._records;
  if (!records || !records.length) { wrap.style.display = 'none'; body.innerHTML = ''; return; }
  var mapped = dsMapRecordFields(records[0], dsReadFieldMapping());
  function row(label, val) {
    var v = (val === null || val === undefined || val === '')
      ? '<span class="v empty">&mdash;</span>' : '<span class="v">' + esc(String(val)) + '</span>';
    return '<div class="ds-preview-row"><span class="k">' + esc(label) + '</span>' + v + '</div>';
  }
  var html = row('Description', mapped.desc) + row('System', mapped.system) +
             row('Actor', mapped.actor) + row('Timestamp', mapped.timestampStr) +
             row('Event Code', mapped.eventCode) + row('Level', mapped.level) +
             row('Integration Code', mapped.managedIntegrationCode);
  if (mapped.interactions.length) html += row('Interactions', mapped.interactions.length + ' mapped');
  if (!mapped.valid) html += '<div class="ds-preview-warn">&#9888; System is blank — this record would fail validation</div>';
  body.innerHTML = html;
  wrap.style.display = 'flex';
}

function dsShowResults(records, fm) {
  var el = document.getElementById('ds-results');
  el._records = records;
  el._fm      = fm || {};
  dsPopulateFieldDatalist(records);

  if (!records.length) {
    el.innerHTML = '<div class="hint" style="padding:8px 0">No records found.</div>';
    dsUpdatePreview();
    return;
  }
  var html = '<div class="ds-result-list">';
  records.forEach(function(rec, i) {
    var mapped = dsMapRecordFields(rec, fm);
    var cls = 'ds-result-item' + (mapped.valid ? '' : ' ds-invalid');
    html += '<div class="' + cls + '" id="dsri-' + i + '">';
    html += '<div class="ds-result-desc">' + esc(mapped.desc) + '</div>';
    html += '<div class="ds-result-meta">';
    if (mapped.system) html += '<span class="ds-result-sys">' + esc(mapped.system) + '</span>';
    if (mapped.actor)  html += '<span class="ds-result-actor">' + esc(mapped.actor) + '</span>';
    if (mapped.tsRaw)  html += '<span class="ds-result-ts">' + esc(mapped.tsRaw) + '</span>';
    html += '</div>';
    if (!mapped.valid) html += '<div class="ds-result-warn">&#9888; No system mapped</div>';
    html += '<button class="btn btn-outline btn-sm ds-add-btn" id="ds-add-' + i + '" onclick="dsImportRecord(' + i + ')">+ Add</button>';
    html += '</div>';
  });
  html += '</div>';
  el.innerHTML = html;
  document.getElementById('ds-import-all-btn').style.display = 'inline-flex';
  dsUpdatePreview();
}

function dsImportRecord(idx) {
  var el  = document.getElementById('ds-results');
  var rec = (el._records || [])[idx];
  if (!rec) return;
  dsRecordToEvent(rec, el._fm);
  var item = document.getElementById('dsri-' + idx);
  var btn  = document.getElementById('ds-add-' + idx);
  if (item) item.classList.add('ds-imported');
  if (btn)  { btn.textContent = '✓ Added'; btn.disabled = true; }
}

function dsImportAll() {
  var el      = document.getElementById('ds-results');
  var records = el._records || [];
  if (!records.length) return;
  records.forEach(function(rec, i) {
    dsRecordToEvent(rec, el._fm);
    var item = document.getElementById('dsri-' + i);
    var btn  = document.getElementById('ds-add-' + i);
    if (item) item.classList.add('ds-imported');
    if (btn)  { btn.textContent = '✓ Added'; btn.disabled = true; }
  });
  document.getElementById('ds-import-all-btn').style.display = 'none';
  toast(records.length + ' record(s) imported', '↑');
  appLog('info', records.length + ' record(s) imported from data source');
}

function dsRecordToEvent(rec, fm) {
  var mapped = dsMapRecordFields(rec, fm);
  mapped.interactions.forEach(function(i) { if (i.target) knownSys.add(i.target); });
  var ev = {
    _id:                      'ds-' + Date.now() + '-' + dsRandomSuffix(),
    desc:                     mapped.desc,
    system:                   mapped.system,
    actor:                    mapped.actor,
    timestamp:                mapped.timestamp,
    timestampStr:             mapped.timestampStr,
    eventCode:                mapped.eventCode,
    level:                    mapped.level,
    managedIntegrationCode:   mapped.managedIntegrationCode,
    interactions:             mapped.interactions,
    mode:                     appMode
  };
  events.push(ev);
  if (ev.system) {
    knownSys.add(ev.system);
    if (!systemsRegistry.find(function(s){return s.name===ev.system;}))
      systemsRegistry.push({name: ev.system, desc: '', order: undefined});
  }
  mapped.interactions.forEach(function(i) {
    if (i.target && !systemsRegistry.find(function(s){return s.name===i.target;}))
      systemsRegistry.push({name: i.target, desc: '', order: undefined});
  });
  if (ev.actor && !actorsRegistry.find(function(a){return a.name===ev.actor;}))
    actorsRegistry.push({name: ev.actor, desc: ''});
  refreshDL();
  render();
  updateList();
}

// ── QUERY IMPORT / EXPORT ──────────────────────────────────────────────────
function dsReadQueryForm() {
  return {
    endpoint:           (document.getElementById('ds-endpoint').value                 || '').trim(),
    queryParams:        (document.getElementById('ds-query').value                    || '').trim(),
    pageSize:           (document.getElementById('ds-page-size').value                || '').trim(),
    offsetParam:        (document.getElementById('ds-offset-param').value             || '').trim(),
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
  document.getElementById('ds-page-size').value                   = q.pageSize           || '20';
  document.getElementById('ds-offset-param').value                = q.offsetParam        || '';
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
  var exportObj = { weaveDsQuery: true, endpoint: q.endpoint, queryParams: q.queryParams,
    pageSize: q.pageSize, offsetParam: q.offsetParam, fieldMap: fieldMap };
  promptExportFilename('weave-ds-query.json','Export Query',function(filename){
    var blob = new Blob([JSON.stringify(exportObj, null, 2)], {type: 'application/json'});
    triggerDownload(blob, filename);
    toast('Query exported', '↓');
    appLog('info', 'Query config exported');
  });
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
        pageSize:          data.pageSize    || '20',
        offsetParam:       data.offsetParam || '',
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
      toast('Query imported', '↑');
      appLog('info', 'Query config imported');
    } catch(err) {
      appLog('error', 'Invalid query file', err && err.message ? err.message : String(err));
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}
