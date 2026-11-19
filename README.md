# Zygon Cognition Finance

A finance assistant you talk to. Attach a bank statement, an invoice list or a spreadsheet, then type what you want done ("match payments to invoices", "what is still unpaid?", "EMI for 12 lakh at 8.5% for 15 years"). Answers appear as cards in the chat, and the file opens as the document it is in a side panel with problems marked. When more than one answer fits, it asks you. It never guesses.

While you type, grey text and a short list suggest commands (Tab completes). While it works, a finance-themed loader (candlesticks and a rupee coin) shows what it is doing.

Everything runs in the browser. Files are read on the user's device and are not sent to any server.

## What works now
- **Match payments to invoices.** Finds the exact set of invoices (and credit notes) that add up to each payment. If more than one set fits, it asks you.
- **Bank statement check.** Re-adds every line to the running balance and marks wrong balances.
- **Spreadsheet totals.** Checks column totals and row totals (footing and cross-footing).
- **Repeat payments and short payments** are flagged and put to the user.
- **Rupee / dollar display** with an editable rate. Matching never converts between currencies.
- **Ask box.** Answers from the loaded files, EMI and GST. Says "I cannot answer that" instead of guessing.

All money is whole paise/cents (integers), so there is no rounding drift.

## Not built yet
Tax returns (TDS, income tax), payroll, DCF models, consolidation, derivatives, actuarial.

## Not tested yet
Real bank PDFs, real Excel files and real statements. PDF reading depends on the bank's layout, and scanned PDFs cannot be read.

## Run it
It is a single static page. Open `index.html`, or serve the folder:

    python3 -m http.server 8765

## Deploy on Vercel
Import this repository. Framework preset: **Other**. Leave Build Command and Output Directory empty. `index.html` at the repository root is served as is.

## Change the code
`app.src.html` (screen) and `engine.js` (the maths) are the sources. `python3 build.py` joins them into `index.html`.

## Tests
    cd tests
    python3 make_ledger.py      # makes a 5-year fake ledger with planted errors
    node test_engine.js         # a pretend user answers every question from the answer key

Last run: 2,370 payments, 191 questions asked, 0 wrong matches, 12/12 repeat payments, 8/8 wrong balances found.
