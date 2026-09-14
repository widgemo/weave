// ── DATA SOURCE QUERY & RECORD MAPPING ──────────────────────────────────────
// Query form handling, results list, and mapping a fetched record onto a
// diagram event. OAuth/token/config core lives in js/datasource-auth.js.

var DS_QUERY_KEY  = 'weave-ds-query';  // localStorage — persists query form state

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
  statusEl.textContent = 'Querying…';
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
  if (btn)  { btn.textContent = '✓ Added'; btn.disabled = true; }
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
    if (btn)  { btn.textContent = '✓ Added'; btn.disabled = true; }
  });
  document.getElementById('ds-import-all-btn').style.display = 'none';
  toast(records.length + ' record(s) imported', '↑');
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
