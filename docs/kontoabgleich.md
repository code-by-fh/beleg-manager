# Documentation: Automated Bank Reconciliation

**Beleg-Manager** features a high-performance system for automatically matching bank transactions with receipts (invoices, vouchers) and split requests. This documentation describes how it works, the underlying algorithms, and implementation details.

---

## 1. Overview & Workflows

Bank reconciliation links actual cash flows on your bank account to the receipts and payment claims recorded in the system. The application supports two automatic matching methods as well as manual intervention:

### A. Automatic Matching on CSV Import
As soon as you upload a bank statement (e.g. an ING Germany CSV file) on the **Kontoabgleich** page:
1. **Deduplication:** Transactions are checked against an app-layer unique key (`bookingDate|amount|merchant`). Existing rows are skipped.
2. **Receipt Matching:** New transactions are automatically compared to unmatched receipts in the system.
3. **Split Matching:** Positive bank transactions (e.g., incoming reimbursements from friends) are automatically matched to open expense split requests (`split_requests`).

### B. Manual Trigger (Auto-Match)
Clicking the **"Auto-Abgleich"** (Auto-Match) button on the user interface triggers the same matching logic on-demand for all currently unmatched transactions and receipts.

### C. Manual Assignment & Corrections
If a transaction cannot be matched automatically, or if an incorrect match is made, you can easily correct it in the UI:
* **Manual Match:** Open the "Zuordnen" (Assign) dialog to see the most likely receipt candidates and select the correct one.
* **Unmatch:** Instantly break an existing match to return the transaction to the unmatched state.
* **Ignore:** Ignore transactions that have no business relevance (e.g., private transfers).

---

## 2. The Matching Algorithm (Receipts)

The core logic of the automatic match is implemented in [matcher.ts](file:///c:/Development/beleg-manager/server/src/bank/matcher.ts). It uses a **score-based greedy assignment algorithm**:

1. The system computes a match score from **0 to 100 points** for every combination of unmatched transactions and unmatched receipts.
2. Any pair with a score of **50 points or higher** is considered a potential match.
3. These candidate pairs are sorted in descending order by score.
4. The algorithm assigns matches greedily (best matches first). Once a transaction or receipt is assigned, it cannot be matched to anything else.

### Scoring Criteria

| Criterion | Condition | Points | Description |
| :--- | :--- | :---: | :--- |
| **Amount (50% weight)** | `roundCents(tx.betrag) === roundCents(receipt.betrag)` | **+50** | Uses absolute values because debit transactions on bank accounts are negative. The comparison is rounded to cents to avoid floating-point errors. |
| **Date (30% weight)** | `dayDiff <= 1` | **+30** | The booking date and receipt date differ by 1 day or less. |
| | `dayDiff <= 2` | **+15** | The booking date and receipt date differ by 2 days or less. (Only the highest date score applies). |
| **Merchant (20% weight)** | `normTx === normReceipt` | **+20** | The merchant names match exactly after normalization. |
| | `normTx.startsWith(normReceipt)` or vice-versa | **+10** | One normalized name starts with the other (e.g., "Aldi Süd" and "Aldi"). |

#### Merchant Name Normalization
To bridge typos or slight formatting variations, merchant names are cleaned before comparison:
```typescript
function normalizeHaendler(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\b(gmbh|ag|se|kg|kgaa|inc|ltd)\b/g, "") // Remove legal forms
    .replace(/[^a-z0-9äöüß\s]/g, " ")                // Strip special characters
    .replace(/\s+/g, " ")                            // Collapse whitespace
    .trim();
}
```

### Match Confidence Levels

The match score determines the confidence level shown in the UI:

* 🟢 **High [Score >= 80]:**
  * *Example:* Amount matches exactly, date differs by <= 1 day, and merchant name matches exactly.
* 🟡 **Medium [Score >= 65]:**
  * *Example:* Amount matches exactly, and either the date differs by <= 1 day OR the merchant name matches.
* 🟠 **Low [Score >= 50]:**
  * *Example:* Only the amount matches exactly. The dates differ by more than 2 days and the merchant name is completely different (common for third-party processors like PayPal).
* 🔵 **Manual:**
  * The link was manually established by the user.

---

## 3. Expense Split Reconciliation (Splits)

For **positive bank transactions** (incoming cash from shared expenses), a separate matching mechanism runs in [routes.ts](file:///c:/Development/beleg-manager/server/src/bank/routes.ts) (`autoMatchSplitsForUser`):

1. **Target:** Link unlinked `split_requests` in `pending` or `accepted` status to incoming transactions.
2. **Greedy Priority:** Open splits are sorted by amount descending (largest first) to avoid ambiguous matches with identical small amounts.
3. **Criteria:**
   * The split amount and transaction amount match exactly.
   * The bank transaction's booking date falls in a **−7 to +60 day window** relative to the split request's creation date (`diff >= -7 && diff <= 60`). The negative offset handles the common case where money arrives before the split is formally entered in the system.

---

## 4. Relevant Files in the Repository

Here are the key implementation files of the bank reconciliation feature:

* 📂 **Backend Logic:**
  * [server/src/bank/matcher.ts](file:///c:/Development/beleg-manager/server/src/bank/matcher.ts) — Pure score-based matching algorithm (no database/HTTP dependencies).
  * [server/src/bank/routes.ts](file:///c:/Development/beleg-manager/server/src/bank/routes.ts) — API endpoints for CSV imports, auto-match triggers, manual matches, and split-matching logic.
  * [server/src/bank/csvParser.ts](file:///c:/Development/beleg-manager/server/src/bank/csvParser.ts) — Parser for the ING CSV format.
* 📂 **Frontend UI:**
  * [client/src/pages/Kontoabgleich.tsx](file:///c:/Development/beleg-manager/client/src/pages/Kontoabgleich.tsx) — Main page featuring CSV file drops, filters, transaction list tabs, and statistics widgets.
  * [client/src/components/bank/BelegZuordnenDialog.tsx](file:///c:/Development/beleg-manager/client/src/components/bank/BelegZuordnenDialog.tsx) — Pop-up dialog allowing users to pick from suggested match candidates manually.
