/**
 * THE RUNNERS PLAYGROUND — RACE LEADERBOARD (Google Apps Script)
 * One Google Sheet holds the goals and finish times for EVERY race.
 * Columns: id | race | name | club | distance | goalTime | actualTime | created | updated
 *
 * Setup: see SETUP.txt. You only deploy this once; new races just work.
 */

const SHEET_NAME = 'Entries';
const HEADERS = ['id', 'race', 'name', 'club', 'distance', 'goalTime', 'actualTime', 'created', 'updated'];

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:I').setNumberFormat('@'); // store everything as plain text
  }
  return sh;
}

function requests_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('Route requests');
  if (!sh) {
    sh = ss.insertSheet('Route requests');
    sh.getRange(1, 1, 1, 10).setValues([['received', 'race', 'date', 'distances', 'place', 'name', 'email', 'note', 'gpx file', 'status']]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:J').setNumberFormat('@');
  }
  return sh;
}

function routeFolder_() {
  const name = 'Runners Playground route requests';
  const it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

/* ---------- BLOG ----------
 * The "Blog" tab: one article per row. Columns:
 * publish | date | category | title | summary | body | image | color
 *  publish  yes / no   (only "yes" rows show on the website)
 *  date     the article date (newest shows first)
 *  body     the article. Leave an empty line between paragraphs.
 *           Lines starting with "- " become a bullet list.
 *  image    optional photo link (a Google Drive share link works)
 *  color    optional: turquoise, yellow or pink
 */
const BLOG_HEADERS = ['publish', 'date', 'category', 'title', 'summary', 'body', 'image', 'color'];

function blogSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('Blog');
  if (!sh) {
    sh = ss.insertSheet('Blog');
    sh.getRange(1, 1, 1, BLOG_HEADERS.length).setValues([BLOG_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    const today = Utilities.formatDate(new Date(), 'Africa/Johannesburg', 'yyyy-MM-dd');
    sh.getRange(2, 1, 3, BLOG_HEADERS.length).setValues([
      ['yes', today, 'Pacing', 'Why your easy runs should feel too easy', 'Slow down on easy days and your hard days get better.', 'Easy runs build your engine without wrecking your legs. If you can chat in full sentences, you are at the right pace.\n\nMost runners go too fast on easy days and too slow on hard days. Slow down on easy days and your hard days get better.', '', 'turquoise'],
      ['yes', today, 'Race day', 'Your night-before race checklist', 'Kit, fuel, alarm, repeat.', '- Lay out your kit and pin your number\n- Charge your watch and set two alarms\n- Eat a familiar dinner, nothing new\n- Plan how you get to the start and arrive 45 minutes early\n\nNothing new on race day: no new shoes, gels or breakfast.', '', 'yellow'],
      ['yes', today, 'Hills', 'Make friends with hills', 'Simple form tips for strong climbs and safe descents.', 'Going up: shorten your stride, lean slightly from the ankles and drive your arms. Aim for even effort, not even pace.\n\nGoing down: relax, let gravity help and keep your feet under you. Walking the steepest bits is smart, not cheating.', '', 'pink']
    ]);
    sh.getRange('F:F').setWrap(true);
    sh.setColumnWidth(6, 420);
  }
  return sh;
}

function driveImage_(url) {
  const u = String(url || '').trim();
  const m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{20,})/);
  if (m) return 'https://lh3.googleusercontent.com/d/' + m[1] + '=w1200';
  return /^https:\/\//i.test(u) ? u : '';
}

function posts_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('posts');
  if (hit) return JSON.parse(hit);
  const rows = blogSheet_().getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[0]).trim().toLowerCase() !== 'yes' || !String(r[3]).trim()) continue;
    const d = r[1] instanceof Date ? Utilities.formatDate(r[1], 'Africa/Johannesburg', 'yyyy-MM-dd') : String(r[1]).trim();
    out.push({ date: d, category: String(r[2]).trim(), title: String(r[3]).trim(), summary: String(r[4]).trim(), body: String(r[5]), image: driveImage_(r[6]), color: String(r[7]).trim() });
  }
  out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  try { cache.put('posts', JSON.stringify(out), 60); } catch (err) {}
  return out;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function clean_(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
}

function validTime_(t) {
  return /^\d{1,2}:\d{2}:\d{2}$/.test(t);
}

/** GET  ...exec?race=westvaal  -> { entries: [...] } for that race
 *  GET  ...exec?action=posts     -> { posts: [...] } published blog articles */
function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'posts') return json_({ posts: posts_() });
  const race = clean_(e && e.parameter && e.parameter.race, 40).toLowerCase();
  const sh = sheet_();
  const rows = sh.getDataRange().getDisplayValues();
  const entries = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    if (race && String(r[1]).toLowerCase() !== race) continue;
    entries.push({ id: r[0], race: r[1], name: r[2], club: r[3], distance: r[4], goalTime: r[5], actualTime: r[6] });
  }
  return json_({ entries: entries });
}

/** POST (text/plain JSON)
 *  { action:'add_goal',   race, id, name, club, distance, goalTime }
 *  { action:'log_actual', race, id, actualTime }
 *  { action:'route_request', race, date, distances, place, name, email, note, gpxName, gpx }
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const sh = sheet_();
    const now = new Date().toISOString();

    if (body.action === 'add_goal') {
      const id = clean_(body.id, 30) || String(Date.now());
      const race = clean_(body.race, 40).toLowerCase();
      const name = clean_(body.name, 40);
      const goal = clean_(body.goalTime, 8);
      if (!race || !name || !validTime_(goal)) return json_({ ok: false, error: 'Missing race, name or goal time.' });
      sh.appendRow([id, race, name, clean_(body.club, 40), clean_(body.distance, 20), goal, '', now, now]);
      return json_({ ok: true, id: id });
    }

    if (body.action === 'log_actual') {
      const id = clean_(body.id, 30);
      const actual = clean_(body.actualTime, 8);
      if (!id || !validTime_(actual)) return json_({ ok: false, error: 'Missing id or time.' });
      const ids = sh.getRange(1, 1, sh.getLastRow(), 1).getDisplayValues();
      for (let i = 1; i < ids.length; i++) {
        if (ids[i][0] === id) {
          sh.getRange(i + 1, 7).setValue(actual);
          sh.getRange(i + 1, 9).setValue(now);
          return json_({ ok: true });
        }
      }
      return json_({ ok: false, error: 'Runner not found.' });
    }

    if (body.action === 'route_request') {
      const race = clean_(body.race, 80), place = clean_(body.place, 120), date = clean_(body.date, 10);
      if (!race || !place || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json_({ ok: false, error: 'Missing race, date or place.' });
      let fileUrl = '';
      const gpx = String(body.gpx || '');
      if (gpx) {
        if (gpx.length > 2 * 1024 * 1024 || !/<gpx[\s>]/i.test(gpx)) return json_({ ok: false, error: 'GPX file not accepted.' });
        const folder = routeFolder_();
        const fname = (date + ' ' + race).replace(/[^\w .-]/g, '').slice(0, 80) + '.gpx';
        fileUrl = folder.createFile(fname, gpx, 'application/gpx+xml').getUrl();
      }
      requests_().appendRow([now, race, date, clean_(body.distances, 40), place, clean_(body.name, 40), clean_(body.email, 80), clean_(body.note, 300), fileUrl, 'new']);
      return json_({ ok: true });
    }

    return json_({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}
