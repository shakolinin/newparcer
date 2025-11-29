# Quick Start Guide

## Installation

1. Navigate to the project directory:
```bash
cd "/home/andrey/projects/new parcer"
```

2. Install dependencies:
```bash
npm install
```

Or use the setup script:
```bash
./setup.sh
```

## Running the Application

Start the development server:
```bash
npm run dev
```

The application will be available at: http://localhost:3000

## Usage

1. Open http://localhost:3000 in your browser
2. Enter a Polymarket profile URL (e.g., `https://polymarket.com/@FirstOrder?tab=positions`)
3. Click "Scrape" button
4. Wait for positions to load (may take 10-30 seconds)
5. Use features:
   - **Filter**: Type in the search box to filter by market name
   - **Sort**: Click column headers to sort by Value or Current Price
   - **Auto-refresh**: Toggle to automatically refresh every 30 seconds

## Building for Production

```bash
npm run build
npm start
```

## Troubleshooting

- **Port already in use**: Change the port with `npm run dev -- -p 3001`
- **Puppeteer errors**: Make sure you have all system dependencies installed
- **Slow scraping**: This is normal - Puppeteer needs time to load and parse the page

