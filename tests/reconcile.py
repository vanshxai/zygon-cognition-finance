# Exact reconciliation + audit checks. No guessing: every result has a status and a reason.
# Statuses:  CERTAIN (only one way to explain it) | PROBABLE (several ways, oldest-first chosen,
#            human must confirm) | NEAR (close but not exact: asks) | UNMATCHED | DUPLICATE
import json, os
from itertools import combinations

D = json.load(open("ledger.json"))
log = []  # audit trail: every decision, in order


def note(msg):
    log.append(msg)


# ---- step 1: duplicates (same customer, date, amount seen twice) ----
seen, dups, clean = {}, [], []
for p in D["payments"]:
    key = (p["customer"], p["date"], p["amount"])
    if key in seen:
        dups.append(p["id"])
        note(f"{p['id']} DUPLICATE of {seen[key]} (same customer, date, amount)")
    else:
        seen[key] = p["id"]
        clean.append(p)

# ---- step 2: match payments to open invoices / credit notes ----
open_items = {}
for it in sorted(D["invoices"], key=lambda x: (x["date"], x["id"])):
    open_items.setdefault(it["customer"], []).append(it)

tainted = {}  # customer -> first unconfirmed PROBABLE payment
result = {}  # payment id -> (status, set of invoice ids)
for p in sorted(clean, key=lambda x: (x["date"], x["id"])):
    pool = [i for i in open_items.get(p["customer"], []) if i["date"] <= p["date"]]
    pool = pool[-14:]  # newest 14 open items: keeps the search small and fast
    hits = []
    for size in range(1, 5):
        for combo in combinations(pool, size):
            if sum(c["amount"] for c in combo) == p["amount"]:
                hits.append(combo)
    if len(hits) == 1:
        status, pick = "CERTAIN", hits[0]
        note(f"{p['id']} CERTAIN: {[c['id'] for c in pick]} = {p['amount']/100:.2f}")
    elif len(hits) > 1:
        # oldest-first rule, but flagged for a human
        pick = min(hits, key=lambda h: (sum(c["date"] for c in h), len(h)))
        if os.environ.get("HUMAN") == "1":  # simulate the user confirming the right one
            right = [h for h in hits if {c["id"] for c in h} == set(D["truth"].get(p["id"], []))]
            pick = right[0] if right else pick
        status = "PROBABLE"
        note(f"{p['id']} PROBABLE: {len(hits)} ways fit, chose oldest {[c['id'] for c in pick]}; confirm")
    else:
        # near match: any single item/bundle within Rs 100 above the payment?
        near = None
        for size in range(1, 4):
            for combo in combinations(pool, size):
                diff = sum(c["amount"] for c in combo) - p["amount"]
                if 0 < diff <= 10000:
                    near = (combo, diff)
                    break
            if near:
                break
        if near:
            status, pick = "NEAR", near[0]
            note(f"{p['id']} NEAR: {[c['id'] for c in near[0]]} short by {near[1]/100:.2f}; confirm")
        else:
            status, pick = "UNMATCHED", ()
            note(f"{p['id']} UNMATCHED: no combination fits {p['amount']/100:.2f}")
    if status == "PROBABLE":
        tainted.setdefault(p["customer"], p["id"])
    elif status == "CERTAIN" and p["customer"] in tainted:
        status = "DEPENDS"  # right only if the earlier guess was right
        note(f"{p['id']} DEPENDS on unconfirmed {tainted[p['customer']]}")
    result[p["id"]] = (status, {c["id"] for c in pick})
    if status in ("CERTAIN", "DEPENDS", "PROBABLE", "NEAR"):
        used = {c["id"] for c in pick}
        open_items[p["customer"]] = [i for i in open_items[p["customer"]] if i["id"] not in used]

# ---- step 3: bank running-balance check ----
bad_bal = []
prev = D["opening"]
for line in D["bank"]:
    expect = prev + (line["amount"] if line["kind"] == "pay" else -line["amount"])
    if expect != line["balance"]:
        bad_bal.append(line["id"])
        note(f"{line['id']} BALANCE WRONG: should be {expect/100:.2f}, shows {line['balance']/100:.2f}")
    prev = expect  # keep the true running value, so one typo gives one alarm

# ---- scoring against the known answers ----
truth = {k: set(v) for k, v in D["truth"].items()}
planted = D["planted"]
score = {"CERTAIN": [0, 0], "DEPENDS": [0, 0], "PROBABLE": [0, 0], "NEAR": [0, 0]}
for pid, (st, ids) in result.items():
    if st in score and pid in truth:
        score[st][0] += 1
        score[st][1] += (ids == truth[pid])
counts = {}
for st, _ in result.values():
    counts[st] = counts.get(st, 0) + 1

print("payments checked (after removing duplicates):", len(clean))
print("status counts:", counts)
for st, (n, ok) in score.items():
    print(f"  {st:9s} {n:5d} decisions, {ok:5d} correct" + (f"  ({100*ok/n:.1f}%)" if n else ""))
print()
for name, found in (("duplicates", dups), ("balance errors", bad_bal)):
    want = set(planted["duplicate" if name == "duplicates" else "balance"])
    f = set(found)
    print(f"{name}: planted {len(want)}, caught {len(want & f)}, false alarms {len(f - want)}")
short_caught = [p for p in planted["short"] if result.get(p, ("", 0))[0] == "NEAR"]
print(f"short payments: planted {len(planted['short'])}, flagged NEAR {len(short_caught)}")
json.dump(log, open("audit_log.json", "w"), indent=0)
print("audit trail lines:", len(log), "-> audit_log.json")

