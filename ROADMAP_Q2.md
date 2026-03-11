# GanMatch Q2 Roadmap

Execution roadmap for resolving critical trust/safety risks while preserving growth in a cold-start marketplace.

## Goals

- Restore trust: no unreviewed high-risk childcare data changes.
- Improve onboarding economics: unlock value for first-time parents without forcing impossible contributions.
- Make product health measurable: instrument funnel and moderation outcomes.

## Success KPIs

- Moderation SLA for pending submissions: P50 < 6h, P90 < 24h.
- % high-risk edits reviewed manually: >= 95%.
- Unlock conversion (first-time parent -> access entitlement): +30%.
- D7 retention for new parent cohort: +20%.
- "Saved but not visible" confusion tickets: -50%.

---

## Milestone 1 (Weeks 1-2)

### Theme
Safety baseline + truthful UX states.

### Scope
- Add `status` lifecycle to `user_inputs` (`pending`, `approved`, `rejected`).
- Add guardrails in approval logic:
  - blacklist checks
  - diff thresholds (price/location)
  - first-pass reputation gating
- Introduce pending/verification badge in UX for submitter.
- Build minimal `/admin/triage` queue for approve/reject.

### Deliverables
- DB migration for moderation fields.
- Updated API behavior: writes default to pending.
- Admin page with side-by-side original vs proposed values.
- Audit logging for moderation decisions.

### Exit Criteria
- No new unmoderated high-risk edits reach public data.
- Submitter sees explicit "Pending verification" state.
- Ops can process queue end-to-end.

### Owners
- Eng: Backend/API + DB + Admin page.
- Product: policy thresholds + moderation playbook.

---

## Milestone 2 (Weeks 3-5)

### Theme
Soft gate and alternative contribution currencies.

### Scope
- Replace login-only review access gate with capability gate.
- Add `user_access_entitlements` model.
- Add unlock modal with 3 paths:
  1. Experienced parent: write review.
  2. First-time parent: verification bounty.
  3. Community helper: referral invite.
- Add basic verification tasks (e.g., phone/hours/vacancy checks).

### Deliverables
- Capability function: `canViewReviews(user)` via entitlements.
- Unlock modal + path tracking.
- Bounty completion and entitlement grant flow.

### Exit Criteria
- At least one non-review unlock path in production.
- Reduced drop-off at locked-review moments.

### Owners
- Eng: frontend gating + entitlement service.
- Product: unlock economics and copy.

---

## Milestone 3 (Weeks 6-7)

### Theme
Referral loop and growth flywheel.

### Scope
- Add `referral_codes` and `referral_events`.
- Qualifying action attribution (invited user completes valid contribution).
- Auto-grant entitlement to referrer.
- Notification messaging on unlock.

### Deliverables
- Referral link generation and claim logic.
- Qualification pipeline and entitlement grant.
- Basic referral analytics.

### Exit Criteria
- Referral-attributed unlocks live.
- Cohort-level measurement of referral quality.

### Owners
- Eng: referral backend + attribution.
- Product: qualifying action definition and anti-gaming policy.

---

## Milestone 4 (Weeks 8-9)

### Theme
Instrumentation and optimization.

### Scope
- Instrument key events:
  - lock wall shown
  - unlock path selected
  - contribution completed
  - entitlement granted
  - review viewed
  - moderation decision latencies
- Build weekly dashboard + cohort cuts.
- Tune thresholds and unlock rewards based on data.

### Deliverables
- Event taxonomy and tracking implementation.
- Product dashboard with funnel and moderation KPIs.
- Policy tuning changelog.

### Exit Criteria
- Team can diagnose drop-offs with confidence.
- At least one measurable KPI improvement per theme.

### Owners
- Eng: analytics implementation.
- Product: KPI review cadence.

---

## Risks and Mitigations

- **Risk:** moderation queue overload.  
  **Mitigation:** tighten auto-approve for trusted users and low-risk fields.

- **Risk:** unlock model is too strict and hurts growth.  
  **Mitigation:** start with generous day-pass + onboarding unlock.

- **Risk:** referral abuse.  
  **Mitigation:** qualify only on meaningful actions + rate limits.

- **Risk:** implementation complexity slows ship velocity.  
  **Mitigation:** strict phased delivery with narrow acceptance criteria.

---

## Weekly Review Cadence

- Monday: queue health + SLA + blockers.
- Wednesday: funnel snapshot and unlock path performance.
- Friday: policy/threshold decisions and next-week scope lock.

