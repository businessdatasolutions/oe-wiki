---
name: check-test-gate-on-stop
enabled: true
event: stop
pattern: .*
action: warn
---

✅ **Voor je stopt — buildplan-checklist (Main Task 1)**

Controleer voordat je stopt:

- [ ] Alle subtasks van Main Task 1 (`../operational-excellence-course/design-documents/buildplan.md`) zijn afgerond
- [ ] `npm run build` slaagt en het OKF-lintscript meldt nul fouten
- [ ] Een mens heeft de gerenderde pagina's (4D-diagram, boekconcepten, bedrijfscases) daadwerkelijk bekeken — niet alleen aangenomen
- [ ] De wijzigingen zijn gecommit én gepusht naar `origin/main`
- [ ] Het taakvakje van Main Task 1 in het buildplan is afgevinkt

Klopt een van deze niet? Rond dat eerst af, of meld expliciet aan de gebruiker wat nog open staat.
