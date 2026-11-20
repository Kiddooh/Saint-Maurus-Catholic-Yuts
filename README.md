# St. Maurus Church Youth Ministry

A mobile-first React/TypeScript community site with an Express/TypeScript and MongoDB API. The previous standalone HTML template remains in `index.html`. The application is in `preview/` and the API is in `server/`.

## Run locally

Requirements: Node.js 20 or later and a MongoDB instance. In separate terminals:

```sh
cd server
npm ci
cp .env.example .env
# Edit .env: set MONGODB_URI and a random JWT_SECRET of at least 32 characters.
npm run dev
```

```sh
cd preview
npm ci
npm run dev
```

Open the Vite URL. Vite proxies `/api` to the local API; browsers never call localhost for API requests. Without MongoDB and the secret, public pages remain visible, while the API (including private document downloads) returns a clear 503 configuration message. `/api/health` reports readiness. Restart the API after changing `.env`.

Dark mode is the default for new visitors. The Appearance drawer offers light and system-following options, and Sanctuary, Ocean and Chapel colour palettes; mode and palette are saved locally on the device.

The public SPA has separate routes for About, Ministries, Events, Resources, Community, Broadcasts, Library, Meditations, Updates, Media, Contact and draft Policies. The labelled, unauthenticated role design preview is available only in the Vite development server and is omitted from production builds. Production hosting must serve the SPA entry point for public route refreshes.

## First administrator

Bootstrap is a **manual, one-time command**, not automatic on application startup. No default administrator credentials are supplied. With MongoDB configured, edit the ignored `server/.env` file locally and add `ADMIN_NAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` using the commented fields in `.env.example`. Choose your own strong, unique password (12–72 characters and at most 72 UTF-8 bytes); quote values as needed for dotenv. Restrict the file to the operator (for example, `chmod 600 .env` on Unix). Then, from `server/`, run:

```sh
npm run create-admin
```

Use a single operator and do not run concurrent bootstrap commands: the check for an existing administrator is not an atomic database-wide singleton lock. The script rejects an existing admin or an already-used email and stores only a bcrypt hash. Sign in via the member portal using the chosen email and password. Remove the three bootstrap entries from `.env` immediately afterward, and keep the file out of backups, logs, source control and public web roots as appropriate for your secrets policy. Do not put real credentials in `.env.example` or frontend files. Public registration creates members only, never administrators. This preview has no configured MongoDB, so no administrator has been created.

## Build and test

```sh
npm run build --prefix server
npm test --prefix server
npm test --prefix preview
npm run build --prefix preview
```

Tests cover SPA navigation, private-document authorization, dashboard preview, unconfigured behavior, request origin/content type checks, authentication/authorization and validation using mocks. They do **not** replace end-to-end tests against a real MongoDB instance, which has not been configured in this workspace.

For a single-origin production deployment, build both packages, set `WEB_DIST` to the absolute path of `preview/dist`, configure `NODE_ENV=production`, and run the compiled API from `server/` with `npm start`. Terminate HTTPS at a trusted proxy that preserves the original Host header; set `TRUST_PROXY=true` only when behind that proxy. Configure database networking, persistent backups, monitoring, domain and secrets first. Cookie sessions require HTTPS in production.

## Important launch limitations

This is an implementation foundation, not a certified enterprise deployment. Email verification, password recovery, MFA, advanced account/role management, email and push notifications, tamper-resistant audit logging, media management, payment processing, automated backups, production monitoring and comprehensive accessibility/security/load testing are not implemented. Account registration currently requires an adult self-attestation and is not an age-verification system. The church must confirm safeguarding, legal/privacy wording, data retention, contact details, branding and image permissions before using it with real people. Do not launch for production or collect real personal data until these gaps and real-database testing have been addressed.

`docs/` contains confidential editable source and PDFs; it is ignored by Git and is never copied to the web build. Administrators download the allowlisted PDFs through the authenticated Project documents panel. In production set `PRIVATE_DOCS_DIR` to an absolute, permission-restricted directory outside `WEB_DIST` and securely provision the PDFs there. In development the API defaults to the workspace `docs/` directory. Rebuild with `python docs/build_pdfs.py` after editing the Markdown. Remove any previously deployed public copies and invalidate CDN caches; ignoring files does not erase Git history, backups or prior downloads. The current hero image and logo icon are placeholders pending rights/brand approval.

## Faith library and profiles

The workspace includes published sermons, teachings and library resources, a Nairobi-time monthly calendar, editable profile details/photos and administrator member suspension/reactivation. Resource links must use HTTPS; files or media are not hosted. Profile photos are cropped in the browser and stored as bounded JPEG data in MongoDB, visible to the user and administrators. Confirm privacy and safeguarding arrangements before collecting real data. The public template-derived content, leader names, schedules and asset rights require client verification. See `docs/phase-5-faith-library-profiles.pdf` for details and limitations.

## Public community

The community feed is public to read and share. Signed-in adult users may like posts and submit reflections or comments for administrator review. Administrators review posts in Content; administrators and assigned moderators review comments in Moderation; My activity lists a member’s own contributions. Only published posts and approved comments are public. The chapel and Bible/rosary images are AI-generated illustrations. Bible and Catechism links go to the Holy See; the music link goes to the ministry’s existing TikTok channel. See `docs/phase-6-community-library.pdf` for moderation, privacy and production limitations.

## Membership, progress, inventory and broadcasts

Registered adults can request church membership separately from account registration and privately mark published faith resources complete. Administrators review membership requests and manage a basic equipment/supplies inventory. Administrators can publish external HTTPS stream or recording links on `/broadcasts` and post announcements to the community feed, where existing likes and moderated comments apply. Broadcast status is manual. Files, video encoding and live streaming are **not** hosted by this application; upload to an approved external platform and link it here. Removing or editing a broadcast does not remove or update previously shared feed posts.

The code now sets API `no-store`, checks production browser mutation origins for HTTPS, and uses a cost-matched dummy password hash when a login account is missing. Indexes support membership, progress and broadcast queries. Both npm audits were clean at the time of this review, but rate limits are still per-process, lists lack pagination, and real MongoDB, concurrency, load and independent security tests are still required. See `docs/phase-7-accounts-broadcasts-security.pdf` for the review and deployment checklist.

## Public resource placement

Administrators select which public pages show each published faith resource. Publication makes the resource public: placement is display control, not access control. Legacy resources without placements retain their previous visibility. Three fixed starter links remain on the Library page. Displayed text selection is disabled; form and editable fields remain selectable. This is not a security control and may hinder accessibility.

## Mobile, PWA and accessibility

The mobile bottom navigation provides labelled shortcuts including Search, with the remaining pages in the navigation drawer. A production HTTPS build includes a manifest, regular and maskable install icons, Apple touch icon and browser favicons. These are placeholder ministry marks pending brand approval. The service worker caches only a generic offline notice—not pages, API responses, accounts or private PDFs. Installation requires browser support; iOS users can use Share → Add to Home Screen. An update prompt lets users save work before reloading. Configure any CDN/proxy to revalidate `sw.js` and `index.html`; retain old hashed assets during deployments. Test install, updates and offline behavior on real devices.

Displayed text selection is disabled as a UI deterrent; form and editable text remains selectable. Blocking selection is not protection and can hinder assistive reading, translation and copying. The previous Appearance opt-in has been removed. The site includes labelled controls, route announcements, modal background isolation, focus restoration, focus indicators, a skip link and reduced-motion support. Light and dark colours have been refined, but the complete site still needs keyboard, screen-reader, contrast, zoom, mobile and user testing; external videos need captions/transcripts.

## Search, community reports and operations

Public search uses MongoDB text indexes and searches only published posts, resources with destinations, upcoming events and broadcasts, with up to eight results per category. Members can save posts and submit a fixed-reason report; administrators and assigned moderators review reports in **Post reports** and manage publication separately in **Content**. Reports are not an emergency service, identify the reporting account to administrators and assigned moderators, and require a safeguarding and retention policy. Saved lists are limited to 100, and reports to 200 recent records. Provision and verify all schema indexes—including unique report/bookmark and text indexes—against real data before rollout.

`/health/live` reports process liveness; `/health/ready` returns 200 only if MongoDB is connected and a sufficiently long JWT secret is configured. It does not check indexes or query health. `MONGO_MAX_POOL_SIZE` (default 20, range 1–200) sets each API instance's Mongo connection pool. `HTTP_LOGGING=true` enables JSON request metadata without query strings, request bodies, cookies or account details; request IDs are server-generated. This is not a security audit log.

No load balancer, database cluster or shared rate-limit store is provisioned. Before running multiple instances, place them behind a trusted HTTPS proxy, preserve Host, block direct backend access, configure `TRUST_PROXY=true` only for exactly one trusted proxy hop, share the JWT secret and protect private document storage. Configure shared/edge rate limits, monitoring, indexes, pagination, graceful shutdown, backup/restore and load/security tests. See the private phase 9 guide for the checklist.


## Church accounts and account security

Administrators and assigned finance staff can open **Church accounts** in the portal to record KES income and expenses, view totals across posted entries, and page through entries. Amounts are stored in integer cents. Entries cannot be edited or deleted through the API: a password-confirmed void records the actor, time and reason; add a replacement entry for a correction. The net shown is recorded income minus recorded expenses, **not** a reconciled bank balance. The API does not process payments, connect to a bank, store receipts, or provide double-entry accounting. All administrators and finance staff can read the ledger; do not put donor names, bank details or confidential personal information in descriptions. There is no immutable/tamper-evident audit system or segregation of duties.

Create requests use a unique per-creator idempotency key and fail closed if the required non-partial unique index `{createdBy:1,requestKey:1}` is unavailable. The database account needs `listIndexes` permission; create/verify indexes before enabling the ledger. Retries within an open entry form retain the same key and details; after closing or reloading the form, check the ledger before re-entering an uncertain submission to avoid duplicates. Void is atomic on each entry. Opening a form does not reserve money. The acting user’s password is required again for ledger creation/voiding; an administrator’s password is required for role changes and account suspension/reactivation/session revocation; failures are rate-limited per API process. Administrators can inspect non-admin accounts, assign the limited member, finance or moderator roles, suspend/reactivate them and revoke their sessions. The UI cannot create/promote administrators, change administrator roles, or reset their passwords; do not use database edits as a normal user-management workflow.

Public search accepts bounded letters, numbers and spaces only, is rate-limited per process and uses time-bounded, published-only MongoDB text queries; it never searches finance, users or private documents. When Express serves `WEB_DIST`, only explicitly listed public assets, hashed build files and known SPA routes are allowed, with containment checks for symlinks; other paths such as `.env`, `.git`, source folders, backups and directory listings return 404. If a CDN or reverse proxy serves static files independently, it must enforce equivalent restrictions; never put secrets inside the build or serve repository roots. Development Vite is not a production server.

**Before actual financial or personal use:** configure and test real MongoDB with indexes and backups, HTTPS, least-privilege database access, and independent security review. Implement MFA, dedicated finance permissions, dual approval, reconciliation, durable tamper-resistant audit logs, incident response, shared rate limiting and retention policies; commission an accountant to validate the workflow. Password reauthentication is not MFA. The ledger is a prototype, not a substitute for approved church accounting controls. See the private phase 10 guide.


## Role-aware mobile dashboards

The dashboard has a desktop sidebar, a mobile workspace drawer and role-specific bottom shortcuts. The development-only dashboard preview includes all four role layouts and contains no real private data. Role changes are made in **Members → View profile** by an administrator with their password. Public registration always creates a member. Changing a role revokes the target's existing sessions; the user must sign in again. Administrators cannot change administrator accounts or promote anyone to administrator using this interface.

- **Member:** personal events, progress, membership, saved posts and profile.
- **Finance staff:** member features plus ledger reading, recording and voiding; no member management, moderation or private project documents. Ledger writes require the finance user's own password.
- **Community moderator:** member features plus comment and report review, including comment and reporting account information; no finance, member management, project documents or post publication. An administrator must change a post's publication status.
- **Administrator:** existing full administrative workspace, including role assignment and private project documents.

API authorization enforces these restrictions independently of dashboard navigation. Permissions are fixed in code, one role is assigned per account, and changing/suspending a non-admin account increments its session version. Previously viewed data cannot be recalled from a user's screen. Reauthentication is not MFA; role assignment has no tamper-resistant audit trail or dual approval. Before real use, implement MFA, audited privileged actions, safeguarding/retention policies, shared rate limits and an independent security review, and test permissions and session revocation on a real database. See private phase 11 guide for details.


## Location and in-app notifications

The separate utility strip above the main header has been removed, while Appearance controls remain in the website and workspace headers. The church location is available in the Contact section. The Contact page loads a Google Maps search embed automatically and shares the visitor’s IP address with Google. The page discloses this and offers hide/reload controls and Google Maps or OpenStreetMap directions links; hiding does not undo the request already made. Loading indicators and timeouts cannot verify that the third-party map actually rendered. The search uses the church name and Mathare North Area 3—not invented coordinates—and its result, entrance and address must be confirmed by the ministry. Third-party map availability is outside the application’s control. The Express CSP permits frames from `https://www.google.com` for this feature; replicate the policy if the SPA is served elsewhere.

Signed-in dashboard users have a notification drawer and unread count. Admins receive generic alerts for new contact messages and pending community reflections; moderators/admins receive alerts for new comments and post reports. Authors are notified when a comment review status changes or a published reflection is updated; applicants are notified of membership decisions. These notifications do not include the submitted content, names, report reasons or finance data. They are in-app only, not email, SMS or OS push. The latest 50 are shown, mark-read operations are account-scoped, and a MongoDB TTL index expires records after approximately 90 days (TTL deletion is asynchronous). Unread counts cover all retained records. Provision and verify notification indexes in the real database.

Socket.IO uses the existing HttpOnly session cookie, exact same-origin WebSocket handshakes and account-specific rooms; no notification contents are sent over the socket. Session validity is checked at connection and before each signal; expired/revoked sockets are disconnected. The browser fetches actual notifications via the authorized no-store API. If real-time delivery is unavailable or another server instance handles an event, the visible dashboard refreshes at least once per minute. Notifications are best effort and are not transactionally guaranteed with the triggering action; do not use them as an audit trail or an emergency/safeguarding alert. Role fanout is limited to 100 active recipients per event; plan a proper queue/outbox and paging for larger deployments. A currently connected browser can have up to eight sockets per user per API instance, subject to races.

For deployment, proxy `/socket.io` to the API with WebSocket upgrades and preserve the original Host and HTTPS Origin, and use the same origin for the SPA and API. The in-process Socket.IO implementation has no cross-instance adapter, shared connection limits or durable event queue. Multi-instance deployment needs a shared adapter, connection/handshake rate limiting at a trusted edge, appropriate load-balancer configuration and load/failover tests. Notification REST polling remains a delayed fallback. Check and configure TTL indexes, backups, monitoring, privacy/retention and staff workflows before use. Real MongoDB, live devices, external maps and deployment infrastructure have not been verified here. See the private phase 12 guide.

## Agreement, policies and launch readiness

The public `/policies` page contains **unapproved drafts** of the privacy notice, site terms and safeguarding guidance; it is not a compliance certification or final agreement. The registration screen links to them without claiming to record acceptance. The church and qualified counsel must confirm the controller, privacy contact, lawful bases, provider arrangements, retention, rights process, safeguarding, final wording and any necessary acceptance/version records before use with real personal data.

The private `agreement-compliance-milestones.pdf` and phase 14 guide are available only in the administrator Project documents panel when private PDFs are provisioned. The agreement, budget, timeline and payment percentages are proposals, not signed terms. They include the outstanding implementation, security, legal and handover gates. No live administrative or financial use should proceed merely because the draft exists.
