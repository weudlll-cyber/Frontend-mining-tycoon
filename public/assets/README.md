# Visual Assets

This folder stores static visual assets used by the frontend.

## Folder structure

- `backgrounds/`: lobby/start-screen background images
- `seasons/`: season-specific images (spring, summer, autumn, winter)
- `ui/`: other UI artwork and decorative assets

## Recommended naming

- Start/lobby background: `backgrounds/seasonal-entertainment.webp` (in use)
- Optional mobile variant: `backgrounds/lobby-bg-mobile.webp`
- Season images:
  - `seasons/spring.webp`
  - `seasons/summer.webp`
  - `seasons/autumn.webp`
  - `seasons/winter.webp`

## Notes

- Prefer `webp` for performance.
- Keep source filenames stable once referenced by UI code.
- Season images exist (`seasons/Spring.png`, `Summer.png`, `Autumn.png`,
  `Winter.png`) but are not used by the UI yet; they are planned for later
  integration (convert them to the `webp` names above when wiring them in).
- The lobby background is `backgrounds/seasonal-entertainment.webp`.
