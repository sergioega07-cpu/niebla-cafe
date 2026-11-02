/**
 * Niebla · receptor de clientes (Google Apps Script, Web App).
 * Recibe POST {tipo:'quiz'|'pedido', nombre, whatsapp, respuestas, cafe_recomendado, cafe, molienda}
 * y hace upsert en la pestaña 'Clientes' por whatsapp normalizado.
 * Columnas A:M: whatsapp, nombre, primera_compra, ultima_compra, n_compras, frecuencia_dias,
 * proxima_sugerida, toca_contactar, respuestas_quiz, cafe_recomendado, ultimo_cafe, molienda, actualizado
 */
var SHEET_ID = '1E-HJqX6nPyc2A_-7KnPJOtayT0c40SNTLbrtgF4UjM4';
var TAB = 'Clientes';
var TZ = 'America/Santiago';

function clean_(v, max) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') v = JSON.stringify(v);
  var s = String(v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // evita inyección de fórmulas
  return s;
}
function normWa_(v) {
  var d = String(v || '').replace(/\D/g, '');
  if (d.indexOf('56') === 0) d = d.slice(2);
  return /^9\d{8}$/.test(d) ? '56' + d : '';
}
function day_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }
function parseDay_(s) {
  if (s instanceof Date) return s;
  var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var raw = (e && e.postData && e.postData.contents) || '';
    if (raw.length > 5000) return out_({ ok: false, error: 'muy largo' });
    var b = JSON.parse(raw);
    var tipo = b.tipo === 'pedido' ? 'pedido' : b.tipo === 'quiz' ? 'quiz' : '';
    var wa = normWa_(b.whatsapp);
    if (!tipo) return out_({ ok: false, error: 'tipo' });
    if (!wa) return out_({ ok: true, skipped: 'sin whatsapp' }); // quiz sin whatsapp queda solo local

    lock.waitLock(10000);
    var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(TAB);
    var data = sh.getDataRange().getValues();
    var rowIdx = -1;
    for (var i = 1; i < data.length; i++) if (normWa_(data[i][0]) === wa) { rowIdx = i; break; }
    var r = rowIdx > 0 ? data[rowIdx].slice(0, 13) : ['', '', '', '', 0, '', '', '', '', '', '', '', ''];
    while (r.length < 13) r.push('');
    var hoy = new Date();

    r[0] = "'" + wa; // texto, no número
    var nombre = clean_(b.nombre, 80); if (nombre) r[1] = nombre;
    var resp = clean_(b.respuestas, 300); if (resp) r[8] = resp;
    var rec = clean_(b.cafe_recomendado, 120); if (rec) r[9] = rec;
    var mol = clean_(b.molienda, 120); if (mol) r[11] = mol;

    if (tipo === 'pedido') {
      var cafe = clean_(b.cafe, 300); if (cafe) r[10] = cafe;
      if (!r[2]) r[2] = day_(hoy);
      r[3] = day_(hoy);
      var n = (parseInt(r[4], 10) || 0) + 1; r[4] = n;
      var p = parseDay_(r[2]), u = parseDay_(r[3]);
      if (n > 1 && p && u) {
        var f = Math.round((u - p) / 86400000 / (n - 1)); r[5] = f;
        r[6] = day_(new Date(u.getTime() + f * 86400000));
      } else { r[5] = ''; r[6] = ''; }
    }
    r[12] = Utilities.formatDate(hoy, TZ, 'yyyy-MM-dd HH:mm');

    var target = rowIdx > 0 ? rowIdx + 1 : sh.getLastRow() + 1;
    sh.getRange(target, 1, 1, 13).setValues([r]);
    // toca_contactar se recalcula sola cada día
    sh.getRange(target, 8).setFormula('=IF(G' + target + '="","",IF(TODAY()>=IF(ISNUMBER(G' + target + '),G' + target + ',DATEVALUE(G' + target + ')),"SI","NO"))');
    return out_({ ok: true });
  } catch (err) {
    return out_({ ok: false, error: 'invalido' });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}
