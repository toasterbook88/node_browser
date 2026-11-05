# 26 · Trail file format (node-trail v2)

Status: draft, Nov 5 2026. Replaces the v1 format in doc 19 for canvas trails. Sharing starts as a file; a link comes later.

## Goals

- One file holds the whole trail: cards, groups, links, timeline.
- Reads cleanly as plain Markdown in any editor, on GitHub, or in an AI assistant.
- Opens in NODE as the same canvas, in the same layout.
- Layout data stays out of the reader's way (HTML comments).

## File

- Name: `<trail-slug>.trail.md`, for example `sourdough-starters.trail.md`.
- Encoding: UTF-8, Markdown with YAML front matter.

## Structure, in order

1. **Front matter**
   - `node-trail: 2`
   - `id`, `name`, `exported-by`, `exported-at` (ISO 8601)
   - `start-here`: card id (optional)
2. **`# Trail name`**, then the sender's note, then a "Start here" link (optional).
3. **One `##` section per group**, in canvas order. The comment under the heading holds the layout:
   `<!-- group:f1 at:0,0 size:820x620 -->`. A resolved group adds `resolved`.
4. **Cards as `###` headings** inside their group. The comment under each heading holds the layout:
   `<!-- id:p1 type:page at:520,60 size:260x250 -->`
5. **`## Not in a group`**: cards on the canvas outside any group.
6. **`## Links`**: one list item per line between cards, with its kind in a comment.
7. **`## Timeline`** (optional): one line per session, oldest items last. Pages that never went on the canvas say "(timeline only)".
8. **`## Open tabs`** (optional).

## Cards

| Type | Heading | Body |
| --- | --- | --- |
| page | `### [Title](url)` | excerpt, then `Keywords:` |
| video | `### [Title](url) · video` | `Saved at 4:12 of 12:04` |
| capture | `### > quoted line` | `Captured from <source> · <device time>` |
| report | `### Report: title` | summary, then `AI-assisted · N sources` |
| question | `### ? Question` | `Status: open · N replies`, then the latest reply |
| note | `### Note` | text, then `— author · date` |
| voice | `### Voice note · 0:22` | transcript |

## Links

`- [From title](#from-id) → [To title](#to-id) · <label> <!-- from:p1 to:c1 kind:auto -->`

| kind | Shown on canvas | Label in the file |
| --- | --- | --- |
| nav | grey line with arrow | opened from |
| auto | grey dotted line | captured from, report on |
| you | white line with end dots | drawn · user's label |

Suggested lines are not saved. They are NODE's guesses, not the sender's work.

## Share sheet choices

- Note: a free-text line under the title.
- Start here: one question card (an open one is preselected).
- Always in the file: cards, groups and links.
- On by default: timeline, with timeline-only pages.
- Off by default: open tabs.
- Never in the file: screenshots (they stay on the sender's computer), sign-in and payment pages, private tabs, other trails.

## Opening a file

- Opening a `.trail.md` in NODE opens it read-only as its own tab, with replay in the sidebar (board C4).
- **Save as new trail** copies it into the reader's trails and lands them on C1 with the canvas as sent. The sender's file is not changed.
- A file without layout comments still opens: NODE lays cards out by group, in file order.

## Later

- Share link, built on the same format.
- Returning a reply file to the sender (merge stays parked, B99).

## Sample

See `scout/sourdough-starters.trail.md`, saved from the C1 prototype.
