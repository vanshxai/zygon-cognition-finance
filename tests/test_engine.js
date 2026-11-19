// Test: run the JS engine on the 5-year ledger. A pretend user answers every question from the answer key.
const E = require('../engine.js');
const D = require('./ledger.json');
const items = D.invoices;
const payments = D.payments.map(p => ({ id: p.id, date: p.date, desc: 'NEFT ' + p.customer, amount: p.amount }));
const truth = D.truth, dupIds = new Set(D.planted.duplicate);
const answers = {};
let rounds = 0, res;
const t0 = Date.now();
for (;;) {
  res = E.reconcile(payments, items, answers); rounds++;
  if (!res.questions.length || rounds > 400) break;
  // answer only the first question of each customer (the rest are blocked anyway) - like a person working down the list
  for (const q of res.questions) {
    const a = answers[q.pay] = answers[q.pay] || {};
    if (q.kind === 'dup') a.dup = dupIds.has(q.pay);
    else if (q.kind === 'pick') {
      const want = (truth[q.pay] || []).slice().sort().join();
      const opt = q.options.find(o => Array.isArray(o.value) && o.value.slice().sort().join() === want);
      a.pick = opt ? opt.value : 'none';
    } else if (q.kind === 'near') {
      const want = (truth[q.pay] || []).slice().sort().join();
      const opt = q.options.find(o => Array.isArray(o.value) && o.value.slice().sort().join() === want);
      a.near = opt ? opt.value : 'none';
    }
  }
}
const ms = Date.now() - t0;
const counts = {}; let wrong = 0, graded = 0;
for (const r of res.rows) {
  counts[r.status] = (counts[r.status] || 0) + 1;
  if (['CERTAIN', 'CONFIRMED', 'SHORT'].includes(r.status)) {
    graded++; if (r.ids.slice().sort().join() !== (truth[r.id] || []).slice().sort().join()) wrong++;
  }
}
const asked = Object.keys(answers).length;
console.log('rounds:', rounds, '| time ms:', ms, '| questions asked in total:', asked, '| payments:', payments.length);
console.log('final status:', counts);
console.log('matched payments graded:', graded, '| WRONG:', wrong);
console.log('open questions left:', res.questions.length);

// first-pass numbers (before any answers)
const first = E.reconcile(payments, items, {});
const c1 = {}; first.rows.forEach(r => c1[r.status] = (c1[r.status] || 0) + 1);
let w1 = 0; first.rows.forEach(r => { if (r.status === 'CERTAIN' && r.ids.slice().sort().join() !== (truth[r.id] || []).slice().sort().join()) w1++; });
console.log('first pass, no answers:', c1, '| wrong CERTAIN:', w1);

// balance audit on the bank lines
const lines = D.bank.map(b => ({ id: b.id, date: b.date, desc: '', debit: b.kind === 'cost' ? b.amount : 0, credit: b.kind === 'pay' ? b.amount : 0, balance: b.balance }));
const errs = E.auditBank(lines), want = new Set(D.planted.balance);
console.log('balance errors: planted', want.size, 'caught', errs.filter(e => want.has(e.id)).length, 'false', errs.filter(e => !want.has(e.id)).length);
// calculators spot check
const L = E.loan(50000000, 900, 60);
console.log('loan 5,00,000 @9% 60m: EMI', E.fmtMoney(L.emi), 'interest', E.fmtMoney(L.totInt), 'put-back', L.putBack, 'last bal', L.rows[59].bal);
console.log('gst 1000 @18% excl:', E.gst(100000, 18, false, false), '| incl 1180:', E.gst(118000, 18, true, false).base);
console.log('xirr:', E.xirr([{ date: 0, amt: -100000 }, { date: 365, amt: 110000 }]));
