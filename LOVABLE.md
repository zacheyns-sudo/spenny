# Lovable Setup Guide

Use this file when connecting Spenny to Lovable.

## What Spenny Is

Spenny is a local-first weekly spend helper PWA. The core backend/business logic already works and has tests. Lovable should primarily redesign the UI and improve the frontend experience.

## Paste This Into Lovable

```text
Redesign the UI for this local-first finance PWA called Spenny.

Preserve the existing backend/business logic and tests:
- src/finance.js
- src/importers.js
- src/ai.js
- src/storage.js
- tests/

Focus on redesigning:
- src/app.js
- src/styles.css
- index.html if needed
- assets/icon.svg if needed

Design direction:
- Premium iPhone-first banking app.
- Dark elegant shell with refined white financial surfaces.
- Clear hero number for safe weekly spend.
- Polished import wizard.
- Clean recurring bills and spending habits views.
- AI assist settings must show the approval preview before sending anything.

Do not add:
- Backend auth
- Cloud sync
- Bank connections
- Server-side storage
- Public landing page
- Financial advice or investment guidance

Keep the app local-first and make sure `npm test` still passes.
```

## Local Commands

```bash
npm test
npm run serve
```

Then open:

```text
http://localhost:5173
```

## GitHub/Lovable Flow

1. Push this repo to GitHub.
2. Connect the GitHub repo in Lovable.
3. Ask Lovable to redesign the frontend using the prompt above.
4. Have Lovable commit changes or open a PR.
5. Run `npm test` after Lovable changes.
6. Manually check the app on an iPhone-sized viewport.

## Design Reference

More detailed redesign context lives in:

```text
stitch-handoff/GOOGLE_STITCH_BRIEF.md
```
