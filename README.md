# Activity in Frame

Turn a run or ride into a share-ready image. Upload a `.fit` file from your watch or bike computer, pick a template, add a photo, and export.

Everything runs in the browser. Files never leave your device, and there is no server or account.

## Features

- `.fit` upload by file picker or drag and drop, including several files at once. Uploads are kept in the browser between visits.
- 13 templates in four collections, each with layouts for 9:16, 4:5, 1:1 and 16:9. Photos can also set the canvas shape.
- Backgrounds: photo (pan, zoom, darken, blur, black and white), solid, gradient, generated graphics, or none.
- 17 data points to choose and reorder, including pace, power, normalized power, heart rate and cadence. km or miles.
- Route map, time-series chart and split table. The route can be coloured by progress, elevation, speed, heart rate, power or cadence.
- Drag, resize, hide and nudge any element. Undo and redo.
- Export PNG, JPG or a transparent overlay PNG at 1× or 2×. Copy, or share on devices that support it.

## Develop

```sh
npm install
npm run dev
npm test
npm run build
```

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository, on the `main` branch.
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.

`.github/workflows/deploy.yml` tests, builds and publishes on each push to `main`. The build uses relative paths, so any repository name works.
