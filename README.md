# Animal Shelter SPCA Tracking App

A React app for recording and reviewing dog training sessions and dog activities.

## Requirements

- [Node.js](https://nodejs.org/) with npm
- Git, if you are cloning the repository

## Run locally

1. Clone the repository and enter the project folder:

   ```bash
   git clone https://github.com/JackyYe23/spca-allegany-county-tracking-website.git
   cd spca-allegany-county-tracking-website
   ```

   If you already have the project files, open a terminal in the project folder instead.

2. Install the dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Open the local URL printed in the terminal (Vite normally uses `http://localhost:5173`).

Press `Ctrl+C` in the terminal to stop the server.

## Production build

To create and locally preview a production build:

```bash
npm run build
npm run preview
```

The preview command prints the local URL to open.

## Data storage

Training sessions, dog activities, and in-progress form drafts are saved in the current browser's local storage. This prototype does not use a shared database, so data is specific to that browser and is not automatically shared with other users or devices. Clearing the browser's site data can remove saved entries.

## Project layout

- `App.js` — app entry point and page switching
- `training-page/` — training page and training entry form
- `dog-activity/` — dog activity page and activity form
- `common/` — shared components, styles, data, and images
- `archive/` — archived ZIP files; not needed to run the app
