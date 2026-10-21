# web-roguelike-soulslike

Top-down Soulslike roguelite for the web. See `TOP_DOWN_SOULSLIKE_ROGUELITE_GDD.md` for the design doc.

Stack: React, Vite, TypeScript, Tailwind CSS, Dexie (IndexedDB) for saves.

```sh
npm install
npm run dev      # local dev server
npm run lint     # oxlint
npm run build    # typecheck + production build into dist/
```

Pushes to `main` deploy to GitHub Pages via `.github/workflows/deploy.yml`.
