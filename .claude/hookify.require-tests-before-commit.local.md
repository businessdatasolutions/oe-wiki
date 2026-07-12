---
name: require-tests-before-commit
enabled: true
event: bash
pattern: git\s+(commit|push)
action: warn
---

🚦 **Test-gate check — oe-wiki (Main Task 1)**

Je staat op het punt te committen/pushen. Volgens `../operational-excellence-course/design-documents/buildplan.md` (Main Task 1) mag dat **alleen** nadat de test gate van deze task succesvol is doorlopen.

Bevestig, vóórdat je doorgaat:
1. Draait `npm run build` (Quartz) zonder fouten?
2. Heeft het OKF-lintscript (`scripts/lint-page.mjs`) nul fouten gemeld op alle nieuw toegevoegde pagina's (AC-09)?
3. Heb je zelf (of via `npm run serve`) handmatig geverifieerd dat de pagina's correct renderen — niet alleen aangenomen dat het goed staat?
4. Is het taakvakje van Main Task 1 in het buildplan al afgevinkt (of vink je dat direct na deze commit af)?

Zo niet: los dat eerst op vóór je opnieuw commit/push probeert. Deze waarschuwing blokkeert de actie niet automatisch — de verantwoordelijkheid ligt bij jou als uitvoerende agent.
