# Church web application

This React/TSX application includes the public site, administrator-only project PDF downloads, event registration, contact form and member/admin workspace. It communicates with the API through same-origin `/api` requests. In development, Vite proxies those requests to `server/` on port 4000. See the repository README for setup, deployment, security limitations and remaining work. Project PDFs are private and must be provisioned separately.

Run `npm ci`, then `npm run dev`; `npm run build` type-checks and builds. Without a configured API the public pages remain viewable, but account, event, news and contact features report that the service is unavailable. `public/hero.jpg` was copied from the original repository as a temporary visual placeholder: provenance and permissions are unverified. The church icon is not an approved logo. Event information and contacts must be verified before publication.
