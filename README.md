# Vocal Aligner

A listings feed application that fetches and displays data from a Google Sheet.

## Features

- Data fetching from Google Sheets via CSV export.
- Dynamic filtering by date, category, authority, and state.
- Responsive design using Tailwind CSS.
- Automated deployment to GitHub Pages.

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/brockdelfante/Vocal-Aligner.git
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Local Development

To start the development server:
```bash
npm run dev
```

### Building for Production

To create a production build:
```bash
npm run build
```

## Deployment

This application is configured to deploy automatically to GitHub Pages via GitHub Actions whenever changes are merged into the `main` branch.

### GitHub Pages URL
The app will be available at: `https://brockdelfante.github.io/Vocal-Aligner/`

### Configuration
The deployment workflow requires a `VITE_OPENROUTER_API_KEY` secret to be configured in your GitHub repository settings under **Settings > Secrets and variables > Actions**.
