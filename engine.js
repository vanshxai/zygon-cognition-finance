// Zygon Finance engine. Plain JS, no libraries. All money = whole paise (integers).
// RULE: the engine never guesses. If more than one answer fits, it makes a QUESTION and waits.
const Engine = (function () {
  // ---------- money / dates ----------
  function parseMoney(s) {
    if (typeof s === 'number') return Math.round(s * 100);
    s = String(s == null ? '' : s).trim();
    if (!s) return null;
    const neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
    const clean = s.replace(/[^0-9.]/g, '');
    if (!/[0-9]/.test(clean)) return null;
    const parts = clean.split('.');
    const whole = parseInt(parts[0] || '0', 10);
    const frac = parseInt(((parts[1] || '') + '00').slice(0, 2), 10);
    const v = whole * 100 + frac;
    return neg ? -v : v;
  }
  const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  function dayNum(y, m, d) { return Math.round(Date.UTC(y, m, d) / 86400000); }
  function parseDate(s) {
    if (s == null || s === '') return null;
    if (typeof s === 'number') { // Excel serial date
      if (s > 20000 && s < 80000) return Math.round(s - 25569);
      return null;
    }
    s = String(s).trim();
    let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return dayNum(+m[1], m[2] - 1, +m[3]);
    if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/))) {
      let y = +m[3]; if (y < 100) y += 2000;
      return dayNum(y, m[2] - 1, +m[1]); // day first (Indian statements)
    }
    if ((m = s.match(/^(\d{1,2})[\s\-]([A-Za-z]{3})[a-z]*[\s\-,]*(\d{2,4})/))) {
      let y = +m[3]; if (y < 100) y += 2000;
      const mo = MON[m[2].toLowerCase()];
      if (mo !== undefined) return dayNum(y, mo, +m[1]);
    }
    return null;
  }
  function fmtDate(n) {
    if (n == null) return '';
    const d = new Date(n * 86400000);
    return String(d.getUTCDate()).padStart(2, '0') + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + d.getUTCFullYear();
  }
  let fmtHook = null;
  function fmtMoney(p) { return fmtHook ? fmtHook(p) : fmtINR(p); }
  function setFmt(fn) { fmtHook = fn; }
  function fmtINR(p) { // Indian digit grouping: 12,34,567.89
    const neg = p < 0; p = Math.abs(p);
    const r = Math.floor(p / 100), f = String(p % 100).padStart(2, '0');
    let s = String(r);
    if (s.length > 3) {
      const last = s.slice(-3); let rest = s.slice(0, -3);
      rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
      s = rest + ',' + last;
    }
    return (neg ? '-' : '') + '₹' + s + '.' + f;
  }
  function divRound(a, b) { // round half up, integers only
    return Math.floor((2 * a + b) / (2 * b));
  }

  // ---------- CSV ----------
  function parseCSV(text) {
    const rows = []; let row = [], cur = '', q = false;
    text = text.replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = '';
        if (row.some(x => x.trim() !== '')) rows.push(row);
        row = [];
      } else cur += c;
    }
    row.push(cur);
    if (row.some(x => x.trim() !== '')) rows.push(row);
    return rows;
  }

  // ---------- reading tables into bank lines / invoices ----------
  function findCol(head, pats) {
    for (let i = 0; i < head.length; i++) for (const p of pats) if (p.test(head[i])) return i;
    return -1;
  }
  function detectKind(rows) {
    if (!rows.length) return 'sheet';
    const head = rows[0].map(x => String(x).toLowerCase());
    const has = p => findCol(head, [p]) >= 0;
    if ((has(/debit|withdraw/) || has(/credit|deposit/)) && has(/balance/)) return 'bank';
    if (has(/invoice|inv\s*no|bill/) && has(/customer|party|client|name/)) return 'ledger';
    if (has(/customer|party|client/) && has(/amount|total|value/)) return 'ledger';
    return 'sheet';
  }
  function readBank(rows) {
    const warn = [];
    const head = rows[0].map(x => String(x).toLowerCase());
    const iD = findCol(head, [/^date|txn date|value date|tran date/]);
    const iT = findCol(head, [/narration|description|particular|details|remark/]);
    const iDr = findCol(head, [/debit|withdraw|dr\b/]);
    const iCr = findCol(head, [/credit|deposit|cr\b/]);
    const iB = findCol(head, [/balance/]);
    const lines = [];
    let skipped = 0;
    for (let r = 1; r < rows.length; r++) {
      const x = rows[r];
      const date = parseDate(x[iD]);
      if (date == null) { skipped++; continue; }
      const dr = iDr >= 0 ? (parseMoney(x[iDr]) || 0) : 0;
      const cr = iCr >= 0 ? (parseMoney(x[iCr]) || 0) : 0;
      lines.push({ id: 'B' + String(lines.length + 1).padStart(4, '0'), date, desc: String(x[iT] || '').trim(),
        debit: Math.abs(dr), credit: Math.abs(cr), balance: iB >= 0 ? parseMoney(x[iB]) : null });
    }
    if (skipped) warn.push(skipped + ' row(s) skipped because the date could not be read');
    if (iD < 0 || iT < 0) warn.push('Could not find a date or description column');
    return { lines, warn };
  }
  function readLedger(rows) {
    const warn = [];
    const head = rows[0].map(x => String(x).toLowerCase());
    const iId = findCol(head, [/invoice|inv\s*no|bill|^id$|doc/]);
    const iC = findCol(head, [/customer|party|client|name/]);
    const iD = findCol(head, [/date/]);
    const iA = findCol(head, [/amount|total|value/]);
    const iType = findCol(head, [/type/]);
    const items = []; let skipped = 0;
    for (let r = 1; r < rows.length; r++) {
      const x = rows[r];
      let amt = parseMoney(x[iA]); const date = parseDate(x[iD]); const cust = String(x[iC] || '').trim();
      if (amt == null || date == null || !cust) { skipped++; continue; }
      const t = iType >= 0 ? String(x[iType]).toLowerCase() : '';
      if (/credit/.test(t) && amt > 0) amt = -amt;
      items.push({ id: String(x[iId] || 'ROW' + r).trim(), customer: cust, date, amount: amt });
    }
    if (skipped) warn.push(skipped + ' row(s) skipped (missing date, amount or customer)');
    return { items, warn };
  }

  // ---------- bank balance audit ----------
  function auditBank(lines) {
    const errors = []; let prev = null;
    for (const l of lines) {
      if (l.balance == null) continue;
      if (prev != null) {
        const expect = prev + l.credit - l.debit;
        if (expect !== l.balance) {
          errors.push({ id: l.id, date: l.date, desc: l.desc, expect, shown: l.balance, diff: l.balance - expect });
          prev = expect; // keep the true running value so one typo = one alarm
          continue;
        }
      }
      prev = l.balance;
    }
    return errors;
  }

  // ---------- reconciliation: never guesses ----------
  function findCombos(pool, target, maxSize) {
    const out = [];
    (function rec(start, size, sum, chosen) {
      if (size > 0 && sum === target) out.push(chosen.slice());
      if (size === maxSize) return;
      for (let i = start; i < pool.length; i++) {
        chosen.push(pool[i]); rec(i + 1, size + 1, sum + pool[i].amount, chosen); chosen.pop();
      }
    })(0, 0, 0, []);
    return out;
  }
  function findNear(pool, target, maxSize, maxDiff) {
    const out = [];
    (function rec(start, size, sum, chosen) {
      const d = sum - target;
      if (size > 0 && d > 0 && d <= maxDiff) out.push({ combo: chosen.slice(), diff: d });
      if (size === maxSize) return;
      for (let i = start; i < pool.length; i++) {
        chosen.push(pool[i]); rec(i + 1, size + 1, sum + pool[i].amount, chosen); chosen.pop();
      }
    })(0, 0, 0, []);
    out.sort((a, b) => a.diff - b.diff || a.combo.length - b.combo.length);
    return out.slice(0, 4);
  }
  const POOL_CAP = 18;

  // payments: [{id,date,desc,amount,customer?}]  items: invoices (+) and credit notes (-)
  // answers: { payId: {dup:bool, party:name, pick:[ids] | 'none', near:[ids] | 'none'} }
  function reconcile(payments, items, answers) {
    answers = answers || {};
    const trail = [], questions = [], rows = [];
    const names = [...new Set(items.map(i => i.customer))];
    const open = {};
    items.slice().sort((a, b) => a.date - b.date || (a.id < b.id ? -1 : 1))
      .forEach(i => (open[i.customer] = open[i.customer] || []).push(i));
    const blocked = {}; // customer -> payment id that is waiting for an answer
    const seen = {};
    const log = m => trail.push(m);
    const label = i => i.id + ' (' + fmtDate(i.date) + ', ' + fmtMoney(i.amount) + ')';
    const optionsFor = combos => combos.map(c => ({ label: c.map(label).join('  +  '), value: c.map(i => i.id) }));

    function detectParty(p) {
      if (p.customer) return p.customer;
      const d = (p.desc || '').toLowerCase();
      let best = null;
      for (const n of names) if (d.includes(n.toLowerCase()) && (!best || n.length > best.length)) best = n;
      return best;
    }

    const sorted = payments.slice().sort((a, b) => a.date - b.date || (a.id < b.id ? -1 : 1));
    for (const p of sorted) {
      const row = { id: p.id, date: p.date, desc: p.desc || '', amount: p.amount, customer: null, status: '', ids: [], note: '', diff: 0 };
      rows.push(row);
      const ans = answers[p.id] || {};
      let cust = detectParty(p);

      // 1. same date + amount + description seen before -> ask, never assume
      const key = p.date + '|' + p.amount + '|' + (p.desc || '').toLowerCase();
      if (seen[key] && ans.dup === undefined) {
        row.customer = cust; row.status = 'ASK';
        row.note = 'Looks like a repeat of ' + seen[key];
        questions.push({ pay: p.id, kind: 'dup', title: p.id + ': possible duplicate',
          text: fmtMoney(p.amount) + ' on ' + fmtDate(p.date) + ' (' + (p.desc || 'no description') + ') appears twice. Is the second one a duplicate?',
          options: [{ label: 'Yes, it is a duplicate (ignore it)', value: true }, { label: 'No, it is a real second payment', value: false }] });
        if (cust) blocked[cust] = blocked[cust] || p.id;
        log(p.id + ' ASK duplicate? same as ' + seen[key]);
        continue;
      }
      if (!seen[key]) seen[key] = p.id;
      if (ans.dup === true) { row.customer = cust; row.status = 'DUPLICATE'; row.note = 'You confirmed this is a duplicate'; log(p.id + ' DUPLICATE (confirmed by user)'); continue; }

      // 2. who paid?
      if (!cust && ans.party) cust = ans.party;
      if (!cust) {
        row.status = 'ASK'; row.note = 'Payer not recognised';
        questions.push({ pay: p.id, kind: 'party', title: p.id + ': who paid this?',
          text: fmtMoney(p.amount) + ' on ' + fmtDate(p.date) + ' ("' + (p.desc || '') + '"). I could not find a customer name in the description.',
          options: names.map(n => ({ label: n, value: n })) });
        log(p.id + ' ASK payer unknown');
        continue;
      }
      row.customer = cust;

      // 3. earlier question for this customer still open -> wait, do not build on a guess
      if (blocked[cust]) { row.status = 'WAITING'; row.note = 'Waiting for your answer on ' + blocked[cust]; log(p.id + ' WAITING on ' + blocked[cust]); continue; }

      let pool = (open[cust] || []).filter(i => i.date <= p.date);
      if (pool.length > POOL_CAP) { log(p.id + ' note: ' + pool.length + ' open items, searched newest ' + POOL_CAP); pool = pool.slice(-POOL_CAP); }
      const take = ids => {
        const set = new Set(ids);
        open[cust] = open[cust].filter(i => !set.has(i.id));
        row.ids = ids.slice();
      };

      // user already answered a pick/near question for this payment
      if (ans.pick === 'none') { row.status = 'UNMATCHED'; row.note = 'You said none of the options is right'; log(p.id + ' UNMATCHED (user)'); continue; }
      if (Array.isArray(ans.pick)) { take(ans.pick); row.status = 'CONFIRMED'; row.note = 'You chose this match'; log(p.id + ' CONFIRMED by user: ' + ans.pick.join(', ')); continue; }
      if (ans.near === 'none') { row.status = 'UNMATCHED'; row.note = 'You said it is not a short payment'; log(p.id + ' UNMATCHED (user)'); continue; }
      if (Array.isArray(ans.near)) {
        const set = new Set(ans.near);
        const sum = (open[cust] || []).filter(i => set.has(i.id)).reduce((a, i) => a + i.amount, 0);
        row.diff = sum - p.amount; take(ans.near); row.status = 'SHORT';
        row.note = 'Paid ' + fmtMoney(row.diff) + ' less than billed (you accepted)'; log(p.id + ' SHORT ' + fmtMoney(row.diff) + ' (user accepted)'); continue;
      }

      const hits = findCombos(pool, p.amount, 4);
      if (hits.length === 1) {
        take(hits[0].map(i => i.id)); row.status = 'CERTAIN';
        row.note = 'Only one combination adds up exactly'; log(p.id + ' CERTAIN: ' + row.ids.join(' + ') + ' = ' + fmtMoney(p.amount));
      } else if (hits.length > 1) {
        row.status = 'ASK'; row.note = hits.length + ' combinations fit exactly';
        questions.push({ pay: p.id, kind: 'pick', title: p.id + ': which invoices did this pay?',
          text: cust + ' paid ' + fmtMoney(p.amount) + ' on ' + fmtDate(p.date) + '. ' + hits.length + ' different sets of invoices add up to exactly this.',
          options: optionsFor(hits.slice(0, 8)).concat([{ label: 'None of these', value: 'none' }]) });
        blocked[cust] = p.id; log(p.id + ' ASK pick: ' + hits.length + ' exact fits');
      } else {
        const near = findNear(pool, p.amount, 3, 10000);
        if (near.length) {
          row.status = 'ASK'; row.note = 'No exact fit; close to a bill';
          questions.push({ pay: p.id, kind: 'near', title: p.id + ': possible short payment',
            text: cust + ' paid ' + fmtMoney(p.amount) + '. No invoices add up exactly, but these are within ₹100 above it (a bank fee or small deduction?).',
            options: near.map(n => ({ label: n.combo.map(label).join('  +  ') + '   (short by ' + fmtMoney(n.diff) + ')', value: n.combo.map(i => i.id) })).concat([{ label: 'No, not a short payment', value: 'none' }]) });
          blocked[cust] = p.id; log(p.id + ' ASK near-match');
        } else {
          row.status = 'UNMATCHED'; row.note = 'No invoices add up to this amount (advance, or an invoice is missing)';
          log(p.id + ' UNMATCHED ' + fmtMoney(p.amount));
        }
      }
    }
    const outstanding = [];
    Object.keys(open).forEach(c => open[c].forEach(i => outstanding.push(i)));
    return { rows, questions, trail, outstanding };
  }

  // ---------- spreadsheet footing / cross-footing ----------
  function footing(grid) {
    const issues = [], checked = [];
    const num = v => { const m = parseMoney(v); return m; };
    const hasText = v => /[A-Za-z]/.test(String(v == null ? '' : v));
    let head = grid[0] || [];
    const lastIsTotal = /total/i.test(String(head[head.length - 1] || ''));
    for (let r = 1; r < grid.length; r++) {
      const row = grid[r];
      const isTotalRow = /total/i.test(String(row[0] || ''));
      for (let c = 1; c < row.length; c++) {
        const val = hasText(row[c]) ? null : num(row[c]);
        if (isTotalRow && val != null) {
          let sum = 0, n = 0;
          for (let k = r - 1; k >= 1; k--) {
            if (/total/i.test(String(grid[k][0] || ''))) break;
            const v = hasText(grid[k][c]) ? null : num(grid[k][c]);
            if (v != null) { sum += v; n++; }
          }
          if (n >= 2) {
            checked.push('Column ' + (head[c] || c) + ' total (row ' + (r + 1) + ')');
            if (sum !== val) issues.push({ where: 'Row ' + (r + 1) + ', column "' + (head[c] || c) + '"', shown: val, expect: sum, kind: 'footing', r, c });
          }
        }
      }
      if (lastIsTotal && !isTotalRow) {
        const tv = num(row[row.length - 1]);
        if (tv != null && !hasText(row[row.length - 1])) {
          let s = 0, n = 0;
          for (let c = 1; c < row.length - 1; c++) { const v = hasText(row[c]) ? null : num(row[c]); if (v != null) { s += v; n++; } }
          if (n >= 2) {
            checked.push('Row ' + (r + 1) + ' across');
            if (s !== tv) issues.push({ where: 'Row ' + (r + 1) + ' (' + (row[0] || '') + '), cross-total', shown: tv, expect: s, kind: 'cross-footing', r, c: row.length - 1 });
          }
        }
      }
    }
    return { issues, checked: checked.length };
  }

  // ---------- calculators ----------
  // Loan schedule. Monthly interest = round-half-up(balance * annual% / 12). Last payment clears the balance.
  function loan(principalPaise, annualRateBp, months) { // rate in basis points: 9.00% = 900
    const r = annualRateBp / 120000; // monthly rate as fraction
    let emi;
    if (annualRateBp === 0) emi = divRound(principalPaise, months);
    else emi = Math.round(principalPaise * r / (1 - Math.pow(1 + r, -months)));
    const rows = []; let bal = principalPaise, totInt = 0;
    for (let m = 1; m <= months; m++) {
      const interest = divRound(bal * annualRateBp, 120000);
      let pay = emi, princ = pay - interest;
      if (m === months || princ > bal) { princ = bal; pay = princ + interest; }
      bal -= princ; totInt += interest;
      rows.push({ m, pay, interest, princ, bal });
    }
    const totPaid = rows.reduce((a, x) => a + x.pay, 0);
    const putBack = rows.reduce((a, x) => a + x.princ, 0) === principalPaise; // principal repaid adds back to loan
    return { emi, rows, totInt, totPaid, putBack };
  }
  function xnpv(rate, flows) {
    const t0 = flows[0].date;
    return flows.reduce((a, f) => a + f.amt / Math.pow(1 + rate, (f.date - t0) / 365), 0);
  }
  function xirr(flows) {
    if (flows.length < 2) return { error: 'Need at least two cash flows' };
    const pos = flows.some(f => f.amt > 0), neg = flows.some(f => f.amt < 0);
    if (!pos || !neg) return { error: 'Need at least one inflow and one outflow' };
    let lo = -0.99, hi = 10, flo = xnpv(lo, flows), fhi = xnpv(hi, flows);
    if (flo * fhi > 0) return { error: 'No single rate found between -99% and 1000%. Check the signs and dates.' };
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2, fm = xnpv(mid, flows);
      if (Math.abs(fm) < 1e-9) { lo = hi = mid; break; }
      if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
    }
    const rate = (lo + hi) / 2;
    return { rate, putBack: xnpv(rate, flows) };
  }
  // GST: rate in percent (whole or half), split into CGST+SGST (or IGST). Round half up to the paisa.
  function gst(amountPaise, ratePct, inclusive, interState) {
    const r100 = Math.round(ratePct * 100); // 18% -> 1800
    let base, tax;
    if (inclusive) { base = divRound(amountPaise * 10000, 10000 + r100); tax = amountPaise - base; }
    else { base = amountPaise; tax = divRound(base * r100, 10000); }
    let cgst = 0, sgst = 0, igst = 0;
    if (interState) igst = tax; else { cgst = Math.floor(tax / 2); sgst = tax - cgst; }
    return { base, tax, cgst, sgst, igst, total: base + tax };
  }

  return { setFmt, fmtINR, parseMoney, parseDate, fmtDate, fmtMoney, parseCSV, detectKind, readBank, readLedger, auditBank,
    reconcile, footing, loan, xirr, gst, divRound };
})();
if (typeof module !== 'undefined') module.exports = Engine;
