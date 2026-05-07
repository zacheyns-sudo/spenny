# Spenny

Spenny is an iPhone-first weekly spend helper PWA. It keeps statement data in the browser, lets you review CSV/PDF imports before saving, detects recurring monthly bills, and turns manual monthly income into weekly spending periods.

## Run

```bash
npm test
npm run serve
```

Then open `http://localhost:5173`.

## Privacy Model

- Statement data is stored locally in IndexedDB.
- Manual monthly income is stored locally.
- AI assist is off until an API key is added.
- AI requests show an approval preview and send only redacted merchant/category snippets plus aggregate spending bands.
- Raw statement files, account identifiers, IBANs, card numbers, and full transaction history are not sent by the app.

## Notes

PDF import is best-effort in this dependency-free version and always requires review before saving. CSV import supports comma and semicolon files, signed amount columns, and separate debit/credit columns.

## Lovable

For Lovable setup and the exact redesign prompt, see `LOVABLE.md`.
