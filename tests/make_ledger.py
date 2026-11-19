# Makes a fake 5-year ledger with KNOWN answers and PLANTED errors.
# All money is whole paise (integers), so there is no rounding at all.
import random, json

random.seed(7)
NAMES = ["Asha Traders", "Bharat Steel", "Cobalt Foods", "Dhruv Tech", "Eka Mills",
         "Falcon Auto", "Gupta Bros", "Hari Pharma", "Indus Print", "Jai Textiles"]
NAMES += [f"Client {i:02d}" for i in range(11, 41)]


def rupees(n):
    return n * 100


invoices = []   # id, customer, date(day number), amount
paid_sets = []  # truth: which invoice ids each payment settles
payments = []   # id, customer, date, amount
n_inv = 0
n_cn = 0
DAYS = 5 * 365

for cust in NAMES:
    open_items = []
    day = random.randint(1, 30)
    while day < DAYS - 60:
        # new invoice; 35% of the time use a round amount (makes real look-alikes)
        amt = rupees(random.choice([5000, 10000, 20000, 25000, 50000])) \
            if random.random() < 0.35 else rupees(random.randint(3000, 180000))
        n_inv += 1
        inv = {"id": f"INV{n_inv:05d}", "customer": cust, "date": day, "amount": amt}
        invoices.append(inv)
        open_items.append(inv)
        day += random.randint(5, 40)

        # time to settle some open items
        if len(open_items) >= random.choice([1, 1, 1, 2, 3]) and random.random() < 0.93:
            k = min(len(open_items), random.choice([1, 1, 1, 1, 2, 3]))
            take = open_items[:k]
            open_items = open_items[k:]
            ids = [t["id"] for t in take]
            total = sum(t["amount"] for t in take)
            # 8%: a credit note is issued against the bundle
            if random.random() < 0.08:
                n_cn += 1
                cn_amt = rupees(random.choice([500, 1000, 2000]))
                cn = {"id": f"CN{n_cn:04d}", "customer": cust, "date": day, "amount": -cn_amt}
                invoices.append(cn)
                ids.append(cn["id"])
                total -= cn_amt
            pdate = day + random.randint(3, 45)
            if pdate < DAYS:
                payments.append({"id": f"PAY{len(payments)+1:05d}", "customer": cust,
                                 "date": pdate, "amount": total})
                paid_sets.append(ids)

truth = {p["id"]: set(ids) for p, ids in zip(payments, paid_sets)}
planted = {"duplicate": [], "short": [], "balance": []}

# PLANTED ERROR 1: 12 duplicate bank payments (same money counted twice)
for p in random.sample(payments, 12):
    dup = dict(p)
    dup["id"] = f"PAY{len(payments)+1:05d}"
    payments.append(dup)
    planted["duplicate"].append(dup["id"])

# PLANTED ERROR 2: 10 short payments (customer paid less: bank fee of Rs 15-60)
shorts = random.sample([p for p in payments if p["id"] in truth and p["id"] not in planted["duplicate"]], 10)
for p in shorts:
    p["amount"] -= rupees(random.randint(15, 60))
    planted["short"].append(p["id"])

payments.sort(key=lambda p: (p["date"], p["id"]))

# Bank statement: opening balance + payments in + monthly costs out, with running balance
bank = []
bal = rupees(500000)
events = [("pay", p) for p in payments]
for m in range(1, 61):
    events.append(("cost", {"id": f"EXP{m:03d}", "date": m * 30, "amount": rupees(random.randint(80000, 160000))}))
events.sort(key=lambda e: (e[1]["date"], e[1]["id"]))
for kind, e in events:
    bal += e["amount"] if kind == "pay" else -e["amount"]
    bank.append({"id": e["id"], "date": e["date"], "kind": kind,
                 "amount": e["amount"], "balance": bal})

# PLANTED ERROR 3: 8 wrong running balances (a typo, or a changed number)
for i in random.sample(range(5, len(bank) - 5), 8):
    bank[i]["balance"] += rupees(random.choice([100, 1000, 5000, -2500]))
    planted["balance"].append(bank[i]["id"])

json.dump({"invoices": invoices, "payments": payments, "bank": bank,
           "truth": {k: sorted(v) for k, v in truth.items()},
           "planted": planted, "opening": rupees(500000)},
          open("ledger.json", "w"))
print("invoices+credit notes:", len(invoices), "| payments:", len(payments),
      "| bank lines:", len(bank))
print("planted:", {k: len(v) for k, v in planted.items()})
