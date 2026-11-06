# SmartFin AI for companies and organisations — plan

Status: **plan only, no code changed.** Audiences: small businesses / shop owners, startups and teams, and accountants managing many clients (all three, one product).

## 1. The idea in one line
Move ownership of all data from **a user** to **a workspace**. A person can belong to many workspaces (personal, their shop, a client) and has a **role** in each.

## 2. Who needs what

| Audience | Needs | Drives |
|---|---|---|
| Small business / shop | A few staff, simple roles, GST, vendors, daily cash and UPI | Roles, GST tags, vendors, simple approvals |
| Startup / team | Many members, departments, projects, expense approvals, reimbursements | Approvals, cost centres, per-team budgets |
| Accountant | One login, many client workspaces, read/write access granted by clients, exports | Workspace switcher, accountant role, audit log, exports |

## 3. Data model changes
New tables:
- `workspaces` (id, name, kind: personal | business, currency, timezone, gstin, created_by)
- `workspace_members` (workspace_id, user_id, role, status, invited_by)
- `workspace_invites` (workspace_id, email, role, token hash, expires_at)
- `audit_log` (workspace_id, actor_id, action, entity, entity_id, before/after, at)
- Later: `cost_centres`, `vendors`, `invoices`, `expense_approvals`

Existing tables (`transactions`, `categories`, `budgets`, `financial_goals`, `recurring_rules`, `transaction_drafts`, `notifications`, imports, integrations): add `workspace_id`, keep `created_by`/`user_id` as the author. Composite foreign keys become `(workspace_id, id)` so rows can never point across workspaces.

Migration for existing users: create one **personal workspace** per user, make them its owner, backfill `workspace_id`. Nothing changes for them until they create or join a company.

## 4. Roles and permissions

| Action | Owner | Admin | Accountant | Approver | Member | Viewer |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Delete workspace / billing | ✔ | | | | | |
| Invite, remove, change roles | ✔ | ✔ | | | | |
| Settings, categories, integrations | ✔ | ✔ | | | | |
| Add / edit / delete any transaction | ✔ | ✔ | ✔ | | | |
| Add own expenses (submit for approval) | ✔ | ✔ | ✔ | ✔ | ✔ | |
| Approve / reject | ✔ | ✔ | | ✔ | | |
| Reports, export | ✔ | ✔ | ✔ | ✔ | own | ✔ |
| View everything | ✔ | ✔ | ✔ | ✔ | own | ✔ |

Enforced in the database (RLS) through one helper, `has_role(workspace_id, min_role)`, never only in the UI.

## 5. Security (the risky part)
- Rewrite every RLS policy from `user_id = auth.uid()` to membership checks. One `is_member(workspace_id)` SECURITY DEFINER function, with a fixed search_path.
- The active workspace is chosen by the app and **always re-verified in the database**, never trusted from a cookie alone.
- Invite tokens are random, stored hashed, single use, expire in 7 days, and are bound to the invited email.
- Last owner cannot leave or be demoted. Removing a member revokes access immediately.
- Audit log is append-only (no update/delete policy).
- The integration test suite gets a cross-workspace matrix: user A in workspace X must never read or write workspace Y, for every table and every role.

## 6. App changes
- **Workspace switcher** in the header (personal / companies / clients), remembered per device.
- **Settings → Team:** members, roles, pending invites, remove.
- **Cache keys** (`memo`, `forgetUser`) become per user **and** workspace.
- **Notifications** become per user per workspace; approvers get "needs your approval".
- **Approvals:** members submit; status pending → approved / rejected with a reason; only approved items count in budgets and reports (configurable).
- **Accountant mode:** a client invites the accountant's email as `accountant`; the accountant sees all client workspaces in the switcher with an overdue/needs-attention badge.
- **Business fields:** GST rate and GSTIN on transactions and vendors, vendor list, invoice number, department / project tags, per-team budgets.
- **Exports:** GST summary, ledger CSV/PDF, audit log CSV.
- **Demo data:** extend the Rohan business seed with two staff and an accountant.

## 7. Stages (each shippable on its own)

1. **Workspaces, members, roles** — schema + migration, RLS rewrite, switcher, Team settings, invites by link (email later), tests. *Largest and riskiest; everything else builds on it.*
2. **Approvals + audit log** — submit/approve flow, approver notifications, history page.
3. **Business tools** — GST, vendors, invoices, departments/projects, team budgets, exports.
4. **Accountant experience** — multi-client overview, per-client status, bulk reports.

## 8. Decisions needed from you
1. Should personal accounts keep working exactly as today alongside companies? (Recommended: yes.)
2. Approvals: should unapproved expenses count in budgets, or only approved ones?
3. Invites: link-only to start (works without email), or wait for SMTP?
4. Pricing/limits (members per workspace, workspaces per user) — none for now, or plan for tiers?
5. Compliance: any need for GST e-invoicing or TDS, or just GST tagging and summaries?

## 9. Out of scope for now
Payroll, payment execution, direct bank-statement ingestion beyond the existing Setu integration, multi-currency, SSO/SAML.

## 10. Effort (rough)
Stage 1 is the bulk of the work (schema, RLS, tests, switcher). Stages 2–4 are mostly additive features on top. I would not start stage 2 until stage 1's cross-workspace test matrix passes.
