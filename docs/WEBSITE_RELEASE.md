# Website audit release — November 2026

## Behavior changes

- Employee checkout submits attendance for review. Only an approved manager sheet enters attendance-based payroll. Short/long shifts and missing checkout prompt a documented review; wages are never inferred from a punch duration.
- Receipts determine invoice status. The old paid/pending toggle rejects writes. Historical opening balances and payment histories are retained. Partial-payment filtering now works.
- Both profit reports use invoice subtotal minus agency gross payroll, employer contributions and operating expenses. Payroll cash expenses appear separately to prevent double counting. Missing registers are flagged; profit is not bank cash flow.
- Staff roles enforce API permissions. Attendance managers are limited to assigned companies. Finance, recruitment, operators and viewers have separate capabilities. Existing operators lose finance access; the owner can reassign roles in Security. Destructive removal stays owner-only.
- Attendance bearer sessions live only in memory. Existing browser-storage tokens are removed. Reloading the attendance app requires sign-in again.
- Public submissions and anonymous analytics have database-backed request budgets. Resume signatures are checked; legacy DOC, macros and embedded Office objects are rejected. This is not antivirus scanning.
- Jobs are created as drafts, require candidate details before activation, and archive without deleting application links. Existing published jobs are retained pending factual review.
- Dashboard menus are grouped; application/enquiry lists paginate; overview queries load only in their section. Staff activity includes allowlisted before/after values for supported existing-record changes, without credentials, contact fields or document content.
- Public wording covers industries beyond factories. Chat has Kannada responses. Anonymous journey counts contain only fixed event names, expire after 90 days, and are approximate browser action counts.
- Readiness checks database connectivity. Required indexes are awaited at startup. Legacy content rewrites are no longer automatic. CI runs backend tests, frontend tests and both production builds.

## Before publishing

1. The owner must privately replace the setup PIN in the existing website's Security page. Verify sign-in afterward. Do not put a PIN or connection string in GitHub, chat or screenshots. There is no default credential in this release; a stored owner hash or explicitly configured ADMIN_PIN is required.
2. Confirm the production MongoDB host and database name against the intended Atlas account using hosting settings. The connected cluster and live site previously showed different record totals. Do not migrate, restore or change connection strings until this is resolved.
3. Confirm database snapshots and file-storage backup coverage. The business ZIP restore only adds missing records; it does not roll back modified/deleted records or preserve all configuration. Perform a recovery drill in an isolated destination with approved access and compare counts and attachments before relying on it.
4. Review the branch and passing CI. Merge only after owner access and the production data source are confirmed.
5. Set the main Render build command to `cd frontend && npm ci && npm run build && cd ../backend && pip install -r requirements.txt`. Keep the existing start command. Configure `/api/health/ready` once the new endpoint is deployed. Set both services to deploy after CI checks pass.
6. Verify both Render deploys are live at the intended commit. Verify public pages, owner login, role boundaries, company lists and attendance reports. Do not generate fake payroll, payments or applications in production for smoke tests.

## Operations

Use `/api/health/live` for process liveness and `/api/health/ready` for database readiness. Readiness must return HTTP 200; a database/index failure must not be represented as healthy. Roll back the application commit on a faulty release; database/data rollback is a separate reviewed recovery operation. Historical data has not been migrated by this change.

Security → Operations & recovery shows sanitized database mapping, release identity, recent attendance email-delivery states, and older recruitment records needing review. A missing/failed scheduled report needs investigation in Render logs and email configuration. The in-process scheduler remains dependent on a running service; moving it to a dedicated scheduler requires a separate hosting configuration decision.

## Remaining owner inputs and external work

- Confirm salary basis, shift/hours, eligibility, benefits, hiring-company identity and closing dates for incomplete jobs. Publish verified employer and compliance evidence only; do not invent testimonials or figures.
- Complete the private owner PIN change and consider an MFA identity provider/enrollment. MFA is not included in this release.
- Resolve production/connected Atlas mapping; verify backups and restoration. No database transfer has been performed.
- Approve a documented retention schedule and actual provider details. The review counter is a prompt, not an automatic deletion policy or legal retention determination.
- Browser verification on narrow mobile screens, real-device attendance and authenticated production smoke checks remain release gates. Automated unit/integration tests are not a substitute for these checks.
- Before/after history covers selected status, financial and access fields on existing records. It is not a full immutable record archive.
