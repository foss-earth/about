# Public Vite contract fixtures

These fixtures are source preparation. They have not been run for the new
adapter. Repeated hashes and `/synthetic` paths are fixture data, not release
receipts.

`workspace.ts` supplies fake filesystem, lockfile, realpath and Git facts to the
causal tests. `public-consumer.mjs` uses only the public package exports and
fails on browser-global access or a private implementation export.
`types.ts` is a strict TypeScript consumer with `skipLibCheck: false` and a
negative private-route import.

After a granted owner build, run the public Node fixture and strict type fixture
against that build. For installed qualification, copy the two fixtures and
`tsconfig.json` into a fresh consumer which has only the exact About archive,
Vite 8.3.4, TypeScript 5.9.3 and the selected Node types. Disable install scripts;
seal the installed file map and public resolution paths before executing them.
Do not treat a repository self-reference as the installed-archive proof.
