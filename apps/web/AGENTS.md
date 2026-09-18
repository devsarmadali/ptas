# Web Application Instructions

- Follow `docs/architecture/frontend-architecture.md` and `docs/ui/`.
- Treat all data returned to the browser as potentially disclosive; minimize it.
- Do not implement authorization only in layouts or components.
- Do not put legal calculations in React components.
- All forms require labels, programmatic error association, an error summary and preserved values after validation failure.
- Use server components by default; add client components only for necessary interaction.
- UI text must not claim final legal approval unless the underlying configuration has approval evidence.
