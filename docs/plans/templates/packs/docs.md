# docs pack

Use this pack when docs are a touched surface but not the dominant risk. If docs
are the dominant deliverable, use `--template docs` as the primary template.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Docs pack selected | pending | pending |
| Docs guidance loaded | pending | pending |
| Docs lane selected | pending | pending |
| Target docs and nearest sibling docs read | pending | pending |
| Docs style doctrine read | pending | Read kitcn doc guidelines for `www/**` docs or record N/A |
| Documented source owner identified | pending | pending |

Work Checklist:
- [ ] Docs pack: docs lane, target docs, nearest sibling docs, and source owner are recorded.
- [ ] Docs pack: every named API, import, option, route, component, transform, demo, and preview is source-backed or marked N/A with reason.
- [ ] Docs pack: docs use current-state reference voice, not changelog voice.
- [ ] Docs pack: links, anchors, and previews target real leaf pages or are marked N/A with reason.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Docs source-backed claim audit | pending | Verify docs claims against current source or record N/A | pending |
| Docs links / routes / previews | pending | Verify leaf links, routes, anchors, and preview names or record N/A | pending |
| Docs MDX/content parser | pending | Run the relevant `www` docs parser/build for MDX/content changes, or record N/A | pending |
| Kitcn docs sync | pending | If `www/**` changed, update matching `packages/kitcn/skills/kitcn/**` content or record N/A | pending |
