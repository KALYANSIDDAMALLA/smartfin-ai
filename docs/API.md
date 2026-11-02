# SmartFin AI: API guide

SmartFin AI has two kinds of backend entry points:

1. **Web endpoints** (7 plain URLs). Documented in Swagger: open **`/api-docs`** on the site (spec: `public/openapi.yaml`).
2. **Server actions** (this page). TypeScript functions in `src/app/actions/` that the app's own forms and buttons call. They are **not public URLs**; they cannot be called from outside the app, and Swagger cannot describe them.

Language: TypeScript on Node.js (Next.js 16). Database: PostgreSQL on Supabase (row-level security). See `docs/SETUP.md` for setup.

## How every server action behaves

- **Identity comes from the session only.** Each action starts by reading the signed-in user from the verified login (`getUserOrNull()` in `src/lib/server/auth.ts`). A user id is never accepted from the browser.
- **Row-level security.** Queries run as the signed-in user, so the database itself only returns that user's rows.
- **Validated input.** Forms are checked with Zod (`src/lib/server/validation.ts`). Money is parsed to whole paise.
- **Rate limited** where abuse matters (`src/lib/server/ratelimit.ts`): sign-in attempts, PIN checks, imports, exports, AI questions and so on.
- **Result shape.** Form actions return `{ ok?: string; error?: string }` (type `FormState`). `ok` is a short success message, `error` is a message safe to show the user. Some actions return data instead (noted below).

## Server actions by file

### `auth.ts`: accounts and sign-in
| Action | What it does |
|---|---|
| `register` | Creates an account (name, email, password, terms, reCAPTCHA) and sends the verification email |
| `login` | Email and password sign-in |
| `resendVerification`, `verifyEmailCode` | Resend the verification email, or confirm with a code |
| `signInWithGoogle` | Starts Google sign-in (returns to `/auth/callback`) |
| `forgotPassword`, `resetPassword` | Password reset by email |
| `logout` | Ends the session |

### `transactions.ts` and `drafts.ts`: the ledger
| Action | What it does |
|---|---|
| `saveTransaction` | Creates or edits an expense, income, transfer, refund or adjustment |
| `deleteTransaction` | Soft-deletes a transaction (it stops counting in totals) |
| `markRecurringPaid` | Records a recurring item (rent, subscription) as paid |
| `saveDraft`, `deleteDraft` | Keeps unfinished entries (for example from a pasted SMS) to finish later |

### `accounts.ts`, `balance.ts`, `integrations.ts`: accounts and bank links
| Action | What it does |
|---|---|
| `addBankAccount`, `archiveAccount` | Adds or hides one of your accounts (bank, card, wallet, cash) |
| `balancePinState` | Returns `{ set: boolean }`: whether you have a balance PIN |
| `setBalancePin(pin, current?)` | Creates the 4 to 6 digit PIN, or changes it (the current PIN is required to change). Stored only as a salted hash |
| `checkAccountBalance(accountId, pin)` | After the PIN is verified in the database (5 wrong tries lock it for 15 minutes) returns the **estimated** balance: opening balance plus the transactions linked to that account |
| `connectBank`, `refreshConnection`, `syncConnection`, `disconnectBank` | Account Aggregator bank linking through Setu (sandbox; not switched on yet) |
| `checkBalance(id)` | Reads the demo balance of a seeded linked bank (demo data only) |

### `plan.ts`: budgets, goals, repayments, settings
| Action | What it does |
|---|---|
| `saveBudget`, `toggleBudget`, `deleteBudget` | Daily to yearly budgets with threshold alerts |
| `saveGoal`, `setGoalStatus`, `deleteGoal`, `addContribution` | Savings goals and contributions (or withdrawals) |
| `saveRecurring`, `toggleRecurring`, `deleteRecurring` | Recurring items and bills |
| `saveSavingsPlan` | The savings planner inputs |
| `saveSettings`, `saveNotificationPrefs` | Currency, time zone, theme, notification choices |
| `markNotificationsRead` | Marks one or all notifications read (this also refreshes the bell count) |

### `loans.ts`: loans and EMIs
| Action | What it does |
|---|---|
| `saveLoan`, `deleteLoan` | Adds or edits a loan (EMI worked out from amount, rate and tenure) or removes it |
| `markEmiPaid` | Records the next instalment as paid and creates its expense transaction |
| `undoLastEmi` | Undoes the most recent instalment and removes its transaction |

### `imports.ts`: statements and receipts
| Action | What it does |
|---|---|
| `uploadImport` | Accepts a CSV, Excel, PDF or receipt image and stages the rows for review. Nothing is saved yet |
| `remapImport`, `updateStagedRow` | Fix column mapping or single rows during review |
| `confirmImport` | Saves the reviewed rows (duplicates are flagged first) |
| `cancelImport` | Discards an import and its file |

### `ai.ts`, `automation.ts`, `suggest.ts`: AI features
| Action | What it does |
|---|---|
| `runAnalysis` | Builds the monthly insights from verified totals (Gemini or OpenAI, with a built-in rule-based fallback) |
| `askAssistant`, `clearConversations` | The chat assistant, answered from your own numbers; and clearing its history |
| `writeCoachPlan` | The 30-day savings plan from the what-if simulator |
| `previewAutoCategorize`, `applyCategories` | Suggests categories for uncategorised transactions; applied only after you approve |
| `quickAsk` | The floating "Ask AI" box |
| `suggestFields`, `smartRead` | Suggests or reads fields from free text (for example a pasted bank SMS) |

### `profile.ts`: your profile
| Action | What it does |
|---|---|
| `uploadAvatar`, `removeAvatar` | Profile picture (served back through `/api/avatar`) |
| `saveProfileDetails` | Name, phone and similar details |

## Errors you may see
- `Please log in again.`: the session expired.
- `Too many … Try again in a while.`: a rate limit was hit.
- `… needs a one-time database update (migration …)`: a database migration from `supabase/migrations/` has not been run yet.

## Want to call something from outside the app?
Today the web endpoints are the only public surface. If you need a real public API (for example for a mobile app), the right step is to add route handlers under `src/app/api/` that reuse the same functions in `src/lib/`, then describe them in `public/openapi.yaml`.
