// Clarke Mechanical Bot — real-browser screen & button checks.
//
// Runs on GitHub Actions every 2 hours (see .github/workflows/health-check.yml).
// 1. Asks the server for the bot's private test world + short-lived bot logins
//    (POST /api/diagnostics/ui/begin, guarded by BOT_KEY).
// 2. Opens the LIVE website in a real Chrome as each role — customer, technician,
//    leads agent, office manager, admin — at phone and desktop sizes, and goes
//    through every screen one by one, checking for:
//      • crashes / "This screen hit a snag" / blank screens
//      • server errors and unexpected sign-outs
//      • pages that scroll sideways on a phone (layout broken)
//      • buttons cut off at the screen edge, covered by something, or too tiny
//      • buttons that do nothing when tapped (rotates through pages each run)
//      • every non-home page has a working Back button
//      • key flows: invoice → View → Download PDF visible, Pay button only on a
//        payable invoice, estimate Accept/Decline, Request Service form, tech job.
// 3. Posts the results (POST /api/diagnostics/ui/report) and deletes the test world
//    (POST /api/diagnostics/ui/end). The server's 2-hour sweep folds the results
//    into the report and alerts you if anything failed.
//
// The bot logins can only see the bot's own test data — never a real customer —
// and can't change anything outside it. Nothing is ever paid, sent or submitted.
import { chromium } from 'playwright';

const API = (process.env.API_URL || 'https://clarke-mechanical-inc.onrender.com/api').replace(/\/+$/, '');
const BOT_KEY = process.env.BOT_KEY || '';
const RUN_URL = process.env.RUN_URL || '';
const ALL_SIZES = process.env.UI_ALL_SIZES === '1';
const PACE = Number(process.env.UI_PACE_MS || 350);            // "go through it slowly"
const SLOW_PAGE_MS = 8000;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const t0 = Date.now();

if (!BOT_KEY) { console.error('BOT_KEY is not set'); process.exit(1); }

async function api(path, body) {
  const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-bot-key': BOT_KEY }, body: JSON.stringify(body || {}) });
  let j = null; try { j = await r.json(); } catch { /* no body */ }
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status} ${j?.error || ''}`);
  return j;
}

// ---- results ----------------------------------------------------------------
const items = [];
let buttonsChecked = 0;
const pagesSeen = new Set();
function add(status, portal, viewport, page, check, detail = '') {
  items.push({ status, portal, viewport, page, check, detail: String(detail).slice(0, 380) });
  const tag = status === 'pass' ? '  ok ' : status === 'warn' ? ' WARN' : ' FAIL';
  if (status !== 'pass') console.log(`${tag} [${portal} · ${viewport}] ${page} — ${check}: ${detail}`);
}

// ---- what to visit ------------------------------------------------------------
function routesFor(ids) {
  return {
    customer: [
      ['/portal', 'Portal home'], ['/billing', 'Billing'], ['/appointments', 'Appointments'],
      ['/my-proposals', 'Proposals'], ['/my-contracts', 'Contracts'], ['/account', 'My Account'],
      ['/more', 'More'], ['/refer', 'Refer & Earn'], ['/addresses', 'Service Addresses'],
      ['/notifications', 'Notifications'], ['/security', 'Security'], ['/about', 'About'],
    ],
    technician: [
      ['/field', 'Field Mode'], ['/', 'Dashboard'], ['/jobs', 'Jobs'], [`/jobs/${ids.jobToday}`, 'Job detail'],
      ['/schedule', 'Schedule'], ['/route', 'Route'], ['/inspections', 'Inspections'],
      ['/installations', 'Installations'], ['/time-clock', 'Time Clock'], ['/sync', 'Sync'], ['/account', 'My Account'],
    ],
    leads: [
      ['/points', 'Points'], ['/pipeline', 'Pipeline'], ['/customers', 'Customers'], ['/account', 'My Account'],
    ],
    office: [
      ['/', 'Dashboard'], ['/tasks', 'To-Do'], ['/customers', 'Customers'], [`/customers/${ids.customer}`, 'Customer detail'],
      ['/pipeline', 'Pipeline'], ['/support', 'Support'], ['/messages', 'Messages & Calls'], ['/jobs', 'Jobs'],
      [`/jobs/${ids.jobDone}`, 'Job detail'], ['/dispatch', 'Dispatch'], ['/schedule', 'Schedule'], ['/route', 'Route'],
      ['/inspections', 'Inspections'], ['/installations', 'Installations'], ['/time-clock', 'Time Clock'],
      ['/invoices', 'Invoices'], [`/invoices/${ids.invoiceSent}`, 'Invoice detail'], ['/payments', 'Payments'],
      ['/receipts', 'Receipts'], ['/email-log', 'Email Log'], ['/quotes', 'Quotes'], ['/proposals', 'Proposals'],
      ['/boiler-contracts', 'Boiler Contracts'], ['/price-book', 'Price Book'], ['/service-pricing', 'Service Pricing'],
      ['/vendor-bills', 'Vendor Bills'], ['/banking', 'Banking'], ['/reports', 'Financial Reports'],
      ['/inventory', 'Inventory'], ['/purchasing', 'Purchasing'], ['/account', 'My Account'],
    ],
    admin: [
      ['/', 'Dashboard'], ['/payroll', 'Payroll'], ['/employees', 'Team'],
      ['/system-check', 'Clarke Mechanical Bot'], ['/settings', 'Settings'], ['/assistant', 'Assistant'],
      ['/reports', 'Financial Reports'], ['/jobs', 'Jobs'], ['/account', 'My Account'],
    ],
  };
}
const HOME = { customer: '/portal', technician: '/field', leads: '/points', office: '/', admin: '/' };
const PORTAL_NAME = { customer: 'Customer portal', technician: 'Technician portal', leads: 'Leads agent portal', office: 'Office portal', admin: 'Admin portal' };

// Taps that could change something real are never pressed (the server would refuse
// them anyway — this just keeps the bot polite).
const DANGER = /follow-up|follow up|delete|remove|void|pay\b|pay \$|charge|refund|send|submit|save|clock|sign ?out|log ?out|approve|decline|accept|confirm|complete|close job|mark |cancel|upload|call|text|email|share|download|print|export|whatsapp|archive|reset|disconnect|connect|import|run |run$|start|stop|assign|book|request|convert|duplicate|generate|create|new |add |\+|invite|enable|disable|turn|reply|post|sync now|retry|collect|record|issue|finish|sign/i;

// Third-party services the bot never loads (costs money / not ours to load-test).
const BLOCK = /maps\.googleapis|maps\.gstatic|js\.stripe\.com|helcim|tile\.openstreetmap|tiles\.|google-analytics|googletagmanager|facebook|hotjar/i;

// ---- in-page probes ------------------------------------------------------------
function probeLayout() {
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const text = (document.body?.innerText || '').trim();
  const desc = (el) => {
    const t = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${el.tagName.toLowerCase()}${t ? ` "${t}"` : ''}`;
  };
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) < 0.05) return false;
    if (el.closest('[aria-hidden="true"], [inert]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // Inside a deliberate side-scroller (tab strip, table) or a clipped container?
  const scroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return p;
    }
    return null;
  };
  // Sideways scroll
  const sw = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
  const overflowBy = sw - vw;
  const wide = [];
  if (overflowBy > 1) {
    for (const el of document.body.querySelectorAll('*')) {
      if (wide.length >= 3) break;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && r.width > 0 && r.width <= sw && !scroller(el) && visible(el)) {
        if (![...el.children].some(c => c.getBoundingClientRect().right > vw + 1)) wide.push(desc(el));
      }
    }
  }
  // Buttons
  const els = [...document.querySelectorAll('button, a[href], [role="button"], input[type="submit"]')]
    .filter(el => !el.disabled && visible(el));
  const cut = [], covered = [], tiny = [];
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.right <= 0 || r.left >= vw) continue;                // parked off-screen on purpose (closed drawer)
    const sc = scroller(el);
    if (!sc && (r.left < -1 || r.right > vw + 1)) cut.push(desc(el));
    if ((r.width < 18 || r.height < 18) && !el.closest('.leaflet-control-container')) tiny.push(desc(el));  // map credits aren't ours
    if (r.top >= 0 && r.bottom <= vh && !sc) {
      const x = Math.min(Math.max(r.left + r.width / 2, 1), vw - 1), y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
        let fixed = false;
        for (let p = hit; p && p !== document.body; p = p.parentElement) {
          const pos = getComputedStyle(p).position; if (pos === 'fixed' || pos === 'sticky') { fixed = true; break; }
        }
        if (!fixed) covered.push(`${desc(el)} under ${desc(hit)}`);
      }
    }
  }
  return {
    textLen: text.length,
    snag: /This screen hit a snag/i.test(text),
    overflowBy, wide, buttons: els.length,
    cut: cut.slice(0, 4), cutN: cut.length, covered: covered.slice(0, 3), coveredN: covered.length,
    tiny: tiny.slice(0, 3), tinyN: tiny.length,
    // "Back", "Back to jobs", "Go back", or an arrow-left control ("← All inspections").
    hasBack: els.some(el => /^\s*(go )?back\b/i.test(el.innerText || '') || /\bback\b/i.test(el.getAttribute('aria-label') || '')
      || !!el.querySelector('svg.lucide-arrow-left, svg.lucide-chevron-left')),
    modal: !!document.querySelector('.modal-surface'),
  };
}

// ---- one session (role × viewport) ---------------------------------------------
async function runSession(browser, site, role, vp, sess, routes, clickSlot) {
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile,
    userAgent: vp.mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 ClarkeHealthBot' : undefined,
    serviceWorkers: 'block',
  });
  await ctx.addInitScript(([token, user]) => {
    try { localStorage.setItem('token', token); localStorage.setItem('user', user); } catch { /* ignore */ }
  }, [sess.token, JSON.stringify(sess.user)]);
  await ctx.route(BLOCK, r => r.abort());
  try { await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: site }); } catch { /* not supported */ }
  const page = await ctx.newPage();
  page.on('dialog', d => d.dismiss().catch(() => {}));
  page.on('popup', p => p.close().catch(() => {}));

  const portal = PORTAL_NAME[role];
  const V = vp.name;
  let cur = { errors: [], consoleErr: [], server: [], signedOut: false };
  page.on('pageerror', e => cur.errors.push(String(e.message || e).slice(0, 160)));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource|net::ERR_|ERR_BLOCKED|favicon/i.test(t)) return;
    cur.consoleErr.push(t.slice(0, 160));
  });
  page.on('response', r => {
    const u = r.url(); if (!u.startsWith(API)) return;
    const s = r.status(), path = u.slice(API.length).split('?')[0];
    if (s >= 500) cur.server.push(`${path} → ${s}`);
    else if (s === 401 && !/\/auth\/refresh/.test(path)) cur.signedOut = true;
  });

  async function open(path) {
    cur = { errors: [], consoleErr: [], server: [], signedOut: false };
    const t = Date.now();
    let navErr = null;
    try { await page.goto(site + path, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch (e) { navErr = e.message; }
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await sleep(PACE);
    return { ms: Date.now() - t, navErr };
  }

  for (let i = 0; i < routes.length; i++) {
    const [path, label] = routes[i];
    pagesSeen.add(`${role}${path}`);
    const { ms, navErr } = await open(path);
    if (navErr) { add('fail', portal, V, label, 'Page would not load', navErr); continue; }
    const finalPath = new URL(page.url()).pathname;
    let L;
    try { L = await page.evaluate(probeLayout); } catch (e) { add('fail', portal, V, label, 'Page could not be inspected', e.message); continue; }
    buttonsChecked += L.buttons;
    let bad = false;
    const F = (check, detail) => { bad = true; add('fail', portal, V, label, check, detail); };
    const Wn = (check, detail) => add('warn', portal, V, label, check, detail);

    if (L.snag) F('Screen crashed ("This screen hit a snag")', cur.errors[0] || 'error boundary shown');
    else if (cur.errors.length) F('JavaScript crash', cur.errors.slice(0, 2).join(' | '));
    if (L.textLen < 20 && !L.snag) F('Blank screen', `only ${L.textLen} characters on the page`);
    if (cur.signedOut || finalPath === '/login') F('Signed out unexpectedly', 'the page logged the user out');
    else if (finalPath !== path && !(path === HOME[role] && finalPath === '/')) F('Page bounced away', `opened ${path}, ended on ${finalPath}`);
    if (cur.server.length) F('Server error', [...new Set(cur.server)].slice(0, 3).join(', '));
    if (L.overflowBy > 1 && vp.mobile) F('Layout scrolls sideways on a phone', `${L.overflowBy}px too wide${L.wide.length ? ` — ${L.wide.join(', ')}` : ''}`);
    else if (L.overflowBy > 1) Wn('Layout wider than the window', `${L.overflowBy}px — ${L.wide.join(', ')}`);
    if (L.cutN) F('Button cut off at the screen edge', `${L.cutN}: ${L.cut.join(', ')}`);
    if (L.coveredN) Wn('Button covered by something', `${L.coveredN}: ${L.covered.join(', ')}`);
    if (L.tinyN && vp.mobile) Wn('Tap target too small', `${L.tinyN}: ${L.tiny.join(', ')}`);
    if (cur.consoleErr.length) Wn('Console errors', cur.consoleErr.slice(0, 2).join(' | '));
    if (ms > SLOW_PAGE_MS) Wn('Slow to load', `${(ms / 1000).toFixed(1)}s`);
    if (path !== HOME[role] && !L.hasBack) F('No Back button', 'every page except home should have one');
    if (!bad) add('pass', portal, V, label, 'Screen OK', `${L.buttons} buttons`);

    // Back button actually goes back (phone only — one check per page is enough).
    if (vp.primary && path !== HOME[role] && L.hasBack) {
      const back = page.locator('main').locator('button:has(svg.lucide-arrow-left), a:has(svg.lucide-arrow-left)')
        .or(page.getByRole('button', { name: /^(go )?back\b/i })).first();
      try {
        await back.click({ timeout: 4000 });
        await sleep(600);
        const after = new URL(page.url()).pathname;
        if (after === path) F('Back button does nothing', 'tapped Back, stayed on the same page');
      } catch (e) { F('Back button can\'t be tapped', e.message.split('\n')[0]); }
    }

    // Dead-button sweep on the rotating phone size — a third of the pages each run,
    // so every page's buttons get tapped every 6 hours.
    if (vp.taps && i % 3 === clickSlot) await tapSweep(page, open, path, portal, V, label);
  }
  await ctx.close();
}

// Tap the safe buttons on a page; flag any that do nothing or can't be tapped.
async function tapSweep(page, open, path, portal, V, label) {
  await open(path);
  const names = await page.evaluate((dangerSrc) => {
    const danger = new RegExp(dangerSrc, 'i');
    const out = [];
    for (const el of document.querySelectorAll('main button, main [role="button"], main a[href^="/"]')) {
      if (el.disabled || el.closest('[aria-hidden="true"]')) continue;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const name = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
      if (!name || name.length > 40 || danger.test(name) || /^back$|^go back$/i.test(name)) continue;
      if (!out.includes(name)) out.push(name);
      if (out.length >= 6) break;
    }
    return out;
  }, DANGER.source).catch(() => []);
  for (const name of names) {
    const main = page.locator('main');
    const loc = main.getByRole('button', { name, exact: true }).or(main.getByRole('link', { name, exact: true })).first();
    try {
      if (!(await loc.isVisible())) { continue; }
      const before = await page.evaluate(() => {
        window.__muts = 0;
        window.__mo?.disconnect();
        window.__mo = new MutationObserver(m => { window.__muts += m.length; });
        window.__mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
        window.__kids = document.body.children.length;
        return location.pathname + location.search;
      });
      await loc.click({ timeout: 4000 });
      await sleep(900);
      const st = await page.evaluate(() => ({ muts: window.__muts || 0, url: location.pathname + location.search, overlay: document.body.children.length !== window.__kids }));
      buttonsChecked++;
      if (st.muts === 0 && st.url === before) {
        // Tapping the tab/filter that's already selected rightly does nothing — not a dead button.
        const selected = await loc.evaluate(el => {
          if (['true', 'page'].includes(el.getAttribute('aria-pressed') || el.getAttribute('aria-selected') || el.getAttribute('aria-current') || '')) return true;
          const sibs = [...(el.parentElement?.children || [])].filter(c => c !== el && c.tagName === el.tagName);
          return sibs.length > 0 && sibs.every(c => c.className !== el.className);
        }).catch(() => false);
        if (!selected) add('warn', portal, V, label, 'Button did nothing when tapped', `"${name}"`);
      }
      // reset for the next tap
      // The tap opened something (new page, dialog, or a full-screen preview) — start the page fresh.
      if (st.url !== before || st.overlay || await page.locator('.modal-surface').count()) await open(path);
    } catch (e) {
      // Only call it broken when something is actually sitting on top of the button.
      const cover = /(<[^>]{1,120}>)[^\n]*intercepts pointer events/.exec(e.message || '');
      if (cover) add('fail', portal, V, label, 'Button is covered and can\'t be tapped', `"${name}" — blocked by ${cover[1].slice(0, 100)}`);
      else add('warn', portal, V, label, 'Button tap could not be confirmed', `"${name}" — ${String(e.message || '').split('\n')[0].slice(0, 140)}`);
      await open(path);
    }
  }
}

// ---- key flows (customer + technician) ---------------------------------------
async function keyFlows(browser, site, vp, sessions, ids) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile, serviceWorkers: 'block' });
  await ctx.route(BLOCK, r => r.abort());
  const V = vp.name;
  const inView = async (page, loc) => {
    const box = await loc.boundingBox(); if (!box) return false;
    const { width, height } = page.viewportSize();
    return box.x >= -1 && box.y >= -1 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1;
  };
  const as = async (role) => {
    const p = await ctx.newPage();
    await p.addInitScript(([t, u]) => { localStorage.setItem('token', t); localStorage.setItem('user', u); }, [sessions[role].token, JSON.stringify(sessions[role].user)]);
    p.on('dialog', d => d.dismiss().catch(() => {}));
    return p;
  };
  const step = async (portal, page, check, fn) => {
    try { const r = await fn(); add(r === true || r == null ? 'pass' : 'fail', portal, V, page, check, typeof r === 'string' ? r : ''); }
    catch (e) { add('fail', portal, V, page, check, e.message.split('\n')[0].slice(0, 200)); }
  };

  // Customer billing
  const c = await as('customer');
  await c.goto(site + '/billing', { waitUntil: 'domcontentloaded' }); await c.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await step('Customer portal', 'Billing', 'Draft invoice is hidden from the customer', async () => (await c.getByText('BOT-DRAFT').count()) === 0 || 'BOT-DRAFT is visible');
  await step('Customer portal', 'Billing', 'Open invoice → Pay button shows', async () => {
    await c.getByText('BOT-SENT').first().click({ timeout: 6000 }); await sleep(500);
    const pay = c.getByRole('button', { name: /Pay \$/ }).first();
    if (!(await pay.isVisible())) return 'no Pay button on an open $125 invoice';
    return (await pay.isEnabled()) || 'Pay button is disabled';
  });
  await step('Customer portal', 'Billing', 'View invoice → Download PDF visible on screen', async () => {
    await c.getByRole('button', { name: /^View$/ }).first().click({ timeout: 5000 }); await sleep(700);
    const dl = c.locator('.modal-surface').getByRole('button', { name: /Download PDF/ });
    if (!(await dl.count())) return 'document preview did not open';
    const ok = await inView(c, dl.first());
    await c.keyboard.press('Escape'); await sleep(300);
    return ok || 'Download PDF button is off-screen';
  });
  await step('Customer portal', 'Billing', 'Paid invoice has no Pay button', async () => {
    await c.getByText('BOT-PAID').first().click({ timeout: 6000 }); await sleep(500);
    const n = await c.getByRole('button', { name: /Pay \$0|Pay \$250/ }).count();
    return n === 0 || 'a paid invoice still offers Pay';
  });
  await step('Customer portal', 'Billing', 'Estimate shows Accept / Decline', async () => {
    await c.getByRole('button', { name: /^Estimates/ }).first().click({ timeout: 6000 }); await sleep(500);
    const est = c.getByText('BOT-EST').first();
    if (!(await est.count())) return 'estimate BOT-EST not listed on the Estimates tab';
    await est.click({ timeout: 6000 }); await sleep(500);
    const a = await c.getByRole('button', { name: /Accept Estimate/ }).first().isVisible();
    const d = await c.getByRole('button', { name: /^Decline$/ }).first().isVisible();
    return (a && d) || `Accept ${a ? 'ok' : 'missing'}, Decline ${d ? 'ok' : 'missing'}`;
  });
  await step('Customer portal', 'Portal home', 'Request Service → Send Request visible on screen', async () => {
    await c.goto(site + '/portal', { waitUntil: 'domcontentloaded' }); await c.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await c.getByRole('button', { name: /Request Service/ }).first().click({ timeout: 6000 }); await sleep(700);
    const send = c.getByRole('button', { name: /Send Request/ }).first();
    if (!(await send.count())) return 'request form did not open';
    const ok = await inView(c, send);
    await c.keyboard.press('Escape');
    return ok || 'Send Request button is off-screen';
  });
  await c.close();

  // Technician job
  const t = await as('technician');
  await step('Technician portal', 'Field Mode', "Today's bot job shows in Field Mode", async () => {
    await t.goto(site + '/field', { waitUntil: 'domcontentloaded' }); await t.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    return (await t.getByText(/Bot Test Job \(today\)/).count()) > 0 || "today's job is missing";
  });
  await step('Technician portal', 'Job detail', 'Job opens with its action buttons on screen', async () => {
    await t.goto(site + `/jobs/${ids.jobToday}`, { waitUntil: 'domcontentloaded' }); await t.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    const txt = await t.locator('body').innerText();
    if (!/Bot Test Job/.test(txt)) return 'job did not load';
    const btns = await t.getByRole('button', { name: /Start|On my way|Clock|In progress|Status/i }).count();
    return btns > 0 || 'no job action buttons found';
  });
  // Offline photo: lose signal → take a photo → it must be kept on the device and
  // upload by itself when signal returns. (Only on one screen size — once is enough.)
  if (vp.primary) {
    await step('Technician portal', 'Job detail', 'Photo taken with NO signal is kept and uploads when signal returns', async () => {
      await t.goto(site + `/jobs/${ids.jobToday}`, { waitUntil: 'domcontentloaded' }); await t.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
      const input = t.locator('input[type="file"]').first();
      if (!(await input.count())) return 'no photo upload control on the job';
      await ctx.setOffline(true);
      try {
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
        await input.setInputFiles({ name: 'bot-offline-photo.png', mimeType: 'image/png', buffer: png });
        try { await t.getByText(/waiting to upload/i).first().waitFor({ timeout: 20000 }); }
        catch { return 'photo taken offline was NOT kept on the device'; }
      } finally { await ctx.setOffline(false); }
      try { await t.getByText(/waiting to upload/i).first().waitFor({ state: 'detached', timeout: 45000 }); }
      catch { return 'photo did not upload within 45s of signal returning'; }
      await t.reload({ waitUntil: 'domcontentloaded' }); await t.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
      const saved = await t.locator('img[alt="job photo"]').count();
      return saved > 0 || 'photo was not on the job after reloading';
    });
  }
  await t.close();
  await ctx.close();
}

// ---- main --------------------------------------------------------------------
let begun = false;
try {
  const w = await api('/diagnostics/ui/begin');
  begun = true;
  const site = (process.env.SITE_URL || w.site).replace(/\/+$/, '');
  const routes = routesFor(w.ids);
  const slot = Math.floor(Date.now() / (2 * 3600 * 1000));
  const extra = [320, 375, 430][slot % 3];
  const VIEWPORTS = ALL_SIZES
    ? [{ name: 'phone 390', w: 390, h: 844, mobile: true, primary: true }, { name: 'phone 320', w: 320, h: 640, mobile: true, taps: true }, { name: 'phone 375', w: 375, h: 740, mobile: true }, { name: 'phone 430', w: 430, h: 932, mobile: true }, { name: 'desktop', w: 1280, h: 800 }]
    : [{ name: 'phone 390', w: 390, h: 844, mobile: true, primary: true }, { name: `phone ${extra}`, w: extra, h: extra === 320 ? 640 : 760, mobile: true, taps: true }, { name: 'desktop', w: 1280, h: 800 }];
  console.log(`Checking ${site} as 5 roles at ${VIEWPORTS.map(v => v.name).join(', ')}`);

  const browser = await chromium.launch();
  // A small pool of browser tabs works through (role × screen size) sessions; inside a
  // session the pages go one by one, with a pause after each.
  const jobs = [];
  for (const vp of VIEWPORTS) {
    for (const role of ['office', 'customer', 'technician', 'admin', 'leads']) jobs.push(async () => {
      try { await runSession(browser, site, role, vp, w.sessions[role], routes[role], slot % 3); }
      catch (e) { add('fail', PORTAL_NAME[role], vp.name, '(session)', 'Browser session failed', e.message); }
    });
    jobs.push(async () => {
      try { await keyFlows(browser, site, vp, w.sessions, w.ids); }
      catch (e) { add('fail', 'Customer portal', vp.name, '(flows)', 'Key flows failed', e.message); }
    });
  }
  const POOL = Number(process.env.UI_TABS || 4);
  await Promise.all(Array.from({ length: POOL }, async () => { while (jobs.length) await jobs.shift()(); }));
  await browser.close();

  const summary = { pages: pagesSeen.size, viewports: VIEWPORTS.length, buttons: buttonsChecked, durationMs: Date.now() - t0 };
  const fails = items.filter(i => i.status === 'fail'), warns = items.filter(i => i.status === 'warn');
  console.log(`\n${summary.pages} screens × ${summary.viewports} sizes · ${buttonsChecked} buttons · ${fails.length} problems · ${warns.length} warnings · ${(summary.durationMs / 1000).toFixed(0)}s`);
  // Send problems first so they survive the server's 500-item cap.
  const ordered = [...fails, ...warns, ...items.filter(i => i.status === 'pass')];
  await api('/diagnostics/ui/report', { summary, items: ordered, run_url: RUN_URL });

  if (process.env.GITHUB_STEP_SUMMARY) {
    const fs = await import('node:fs');
    const rows = [...fails, ...warns].slice(0, 60).map(i => `| ${i.status === 'fail' ? '❌' : '⚠️'} | ${i.portal} | ${i.viewport} | ${i.page} | ${i.check} | ${i.detail.replace(/\|/g, '/')} |`).join('\n');
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Clarke Mechanical Bot — screens & buttons\n\n${summary.pages} screens × ${summary.viewports} sizes · ${buttonsChecked} buttons · **${fails.length} problems**, ${warns.length} warnings\n\n${rows ? `| | Portal | Size | Screen | Check | Detail |\n|---|---|---|---|---|---|\n${rows}\n` : 'Everything passed.\n'}`);
  }
} catch (e) {
  console.error('UI health check could not run:', e.message);
  process.exitCode = 1;   // GitHub emails you when the whole check can't run (e.g. the app is down)
} finally {
  if (begun) { try { const r = await api('/diagnostics/ui/end'); console.log(`Cleanup: removed ${r.removed} test records, ${r.left} left`); } catch (e) { console.error('Cleanup call failed:', e.message); process.exitCode = 1; } }
}
