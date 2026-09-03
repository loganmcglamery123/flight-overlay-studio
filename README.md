# Flight Overlay Studio

A static, privacy-friendly web app for turning a paragliding IGC track and a photo or video into a customizable flight overlay.

Everything runs in the browser. Uploaded flight logs and media are not sent to a server.

## What it does

- Parses standard IGC `B` records directly in the browser
- Draws the flight track, elevation profile, statistics, and flight-sport mark as directly editable canvas elements
- Calculates total track length, a three-turnpoint route estimate, a triangle estimate, duration, average speed, maximum elevation, elevation gain, maximum climb, and maximum sink
- Switches between metric and imperial units
- Lets the user choose which elements and statistics appear
- Supports dark glass, light glass, and panel-free styles
- Lets each element be dragged, resized, or removed directly on the photo with mouse, touch, or keyboard controls
- Keeps the centered overlay panel and every element visible in a single-screen desktop and mobile editor
- Adjusts panel size, opacity, text color, accent color, and media fit from a compact contextual inspector
- Gives the track and altitude graph independent colors, line widths, and sizes
- Adds optional start, maximum, and landing altitude labels in the selected unit system
- Places a larger track inside the centered panel by default, with North-up, automatic best-fit, slider, and direct rotation controls
- Includes an optional rotating compass and paraglider, hang-glider, or sailplane mark
- Downloads full-resolution photos as maximum-quality JPEG files
- Downloads a full-resolution transparent PNG containing only the overlay for use as a sticker
- Records videos as MP4 in real time when the browser supports MP4 MediaRecorder output
- Deploys automatically to GitHub Pages after each push to `main`

## Publish on GitHub Pages

### 1. Create the GitHub repository

1. Sign in to GitHub and select **New repository**.
2. Name it `flight-overlay-studio`.
3. Choose **Public** unless your GitHub plan supports Pages for private repositories.
4. Do **not** add a README, `.gitignore`, or license because those files are already in this project.
5. Select **Create repository**.

### 2. Push this project

Extract the downloaded project, open PowerShell or Terminal inside the extracted `flight-overlay-studio` folder, and run:

```bash
git init
git add .
git commit -m "Initial Flight Overlay Studio"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/flight-overlay-studio.git
git push -u origin main
```

Replace `YOUR-USERNAME` with your GitHub username. GitHub may open a browser window for sign-in the first time you push.

### 3. Turn on GitHub Pages

1. Open the repository on GitHub.
2. Select **Settings**.
3. Select **Pages** under **Code, planning, and automation**.
4. Under **Build and deployment**, set **Source** to **GitHub Actions**.
5. Open the repository's **Actions** tab. The included `Deploy to GitHub Pages` workflow should be running.
6. When the workflow finishes, the site will normally be available at:

```text
https://YOUR-USERNAME.github.io/flight-overlay-studio/
```

The included workflow automatically accounts for the repository-name portion of that URL. You do not need to edit a base path.

If the first workflow ran before Pages was enabled and failed, open that run in **Actions** and select **Re-run all jobs**.

## Run it locally

Install [Node.js 22](https://nodejs.org/), then run:

```bash
npm install
npm run dev:github
```

Open the local URL shown in the terminal. To verify the same production build used by GitHub Pages:

```bash
npm run typecheck:app
npm run build:github
npm run preview:github
```

## How the statistics are calculated

- **Total track length** sums the great-circle distance between consecutive valid fixes.
- **Average speed** is total track length divided by elapsed track time, so time spent circling or stationary remains included.
- **3 turn points** finds the longest chronologically ordered four-leg route: start, three turn points, and finish. The track is sampled for browser performance.
- **Triangle** finds the largest three-point perimeter in a sampled version of the track.
- **Elevation gain** is maximum smoothed altitude minus smoothed takeoff altitude, with a minimum of zero.
- **Max climb and sink** use short multi-second windows on the smoothed altitude series to reduce one-fix GPS noise.
- Fixes marked invalid, duplicate/non-increasing timestamps, and jumps requiring more than 250 km/h groundspeed are ignored.

The optimized open-distance and triangle values are estimates for a visual overlay. They do not implement every CIVL, XContest, national-league, closure, or FAI-triangle rule and should not be used as official scores.

## Browser notes

- Photo export keeps the source pixel dimensions and uses the browser's maximum JPEG quality setting. JPEG encoding is still lossy, so it cannot be byte-for-byte identical to the source.
- Transparent sticker export uses the same pixel dimensions as the loaded photo or video, making it easy to align in another editor.
- MP4 video export depends on the codecs exposed by the browser. The app checks support before recording and shows a compatibility message instead of creating a mislabeled file.
- Video export runs in real time. A five-minute source takes about five minutes to record.
- Original audio is included when the browser exposes the video's audio track. If it does not, the exported video is silent.
- Very large or 4K videos can use substantial memory. Closing other media-heavy tabs helps.
- A video codec must be playable by the browser before it can be exported.

## Project layout

```text
app/page.tsx                 Main editor and export workflow
app/globals.css              Visual design and responsive layout
lib/flight.ts                IGC parsing and flight calculations
lib/render-overlay.ts        Canvas rendering and unit formatting
github/                      Static GitHub Pages entry point
.github/workflows/           Automatic Pages deployment
```

## Update the live site later

After editing the project, run:

```bash
git add .
git commit -m "Describe the change"
git push
```

Each push to `main` rebuilds and republishes the site automatically.
