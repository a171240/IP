# Release Manifest Template

Copy this template into the release note or task handoff before any production
deploy or WeChat upload.

## Basic Info

- Release date:
- Release thread:
- Operator:
- Version:
- Backend repository:
- Backend branch:
- Mini-program repository:
- Mini-program branch:
- Supabase project/environment:

## Permission Confirmation

- Has the user explicitly named this thread as the release thread?
- Are all other threads frozen from production deploy/upload?
- Is this release allowed to touch production data or schema?

## Workspace State

Backend status:

```text
Paste git status --short --branch here.
```

Mini-program status:

```text
Paste git status --short --branch here.
```

Untracked files that must be included:

```text

```

Dirty files intentionally excluded:

```text

```

## Included Changes

- 

## Explicitly Not Included

- 

## Database Changes

- Supabase migration files:
- Applied to production:
- Rollback/recovery plan:

## Backend Deployment

- Vercel project:
- Preview deployment URL:
- Production deployment ID:
- Production alias/domain:
- Deploy command:

Backend smoke results:

```text

```

Required backend checks:

- `/api/mp/profile`
- `/api/mp/virtual-pay/products`
- `/api/mp/service-records/sessions`
- Any changed admin/store route

## Mini-program Upload

- WeChat AppID:
- DevTools CLI path:
- Upload version:
- Upload description:
- Upload command:
- Upload result:

Mini-program local checks:

```text

```

Required mini-program checks:

- `app.json` routes exist.
- Mine page loads.
- Store workspace loads.
- Staff training page loads.
- Pay/service package page loads.
- Service record entry behaves as expected.

## Risk Checklist

- Unknown dirty changes:
- Deleted files:
- Route conflicts:
- Product/point display conflicts:
- Store account permission conflicts:
- Service-record backend availability:
- Test data visibility:

## Rollback / Recovery

- Previous backend deployment ID:
- Previous mini-program version:
- Database rollback note:
- Who should be notified:

## Final Decision

- Release approved:
- Released by:
- Release time:
- Follow-up items:
