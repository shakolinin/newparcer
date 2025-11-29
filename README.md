# Polymarket Positions Parser

A Next.js application to scrape and display Polymarket user positions without using the public API.

## Features

- 🔍 Scrape Polymarket user positions from profile pages
- 📊 Display positions in a clean, data-dense table
- 🔄 Auto-refresh every 30 seconds
- 🔎 Filter positions by market name
- 📈 Sort by value or price (ascending/descending)
- 🌙 Dark mode UI
- ⚡ Fast and responsive

## Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **Styling:** Tailwind CSS
- **Icons:** Lucide React
- **Scraping:** Puppeteer
- **Language:** TypeScript

## Requirements

- Node.js >= 18.17.0 (recommended: 20.x)
- npm >= 9.0.0

If you're using nvm, the project includes a `.nvmrc` file that will automatically use the correct version.

## Installation

1. If using nvm, ensure you're using the correct Node.js version:

```bash
nvm use
# or
nvm install 20
nvm use 20
```

2. Install dependencies:

```bash
npm install
```

Or use the setup script:

```bash
./setup.sh
```

2. Run the development server:

```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. Enter a Polymarket profile URL (e.g., `https://polymarket.com/@FirstOrder?tab=positions`)
2. Click "Scrape" to fetch positions
3. Use the filter input to search by market name
4. Click column headers to sort by Value or Current Price
5. Enable auto-refresh to automatically update positions every 30 seconds

## API Endpoint

### GET `/api/scrape?profileUrl=<url>`

Scrapes positions from a Polymarket profile page.

**Query Parameters:**
- `profileUrl` (required): The Polymarket profile URL with `?tab=positions`

**Response:**
```json
{
  "positions": [
    {
      "marketName": "Market Name",
      "marketUrl": "https://polymarket.com/event/...",
      "outcome": "Yes",
      "currentPrice": "55¢",
      "value": "$12,450"
    }
  ],
  "count": 1
}
```

## Project Structure

```
.
├── app/
│   ├── api/
│   │   └── scrape/
│   │       └── route.ts      # API route for scraping
│   ├── globals.css           # Global styles
│   ├── layout.tsx            # Root layout
│   └── page.tsx              # Main page component
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── README.md
```

## Building for Production

```bash
npm run build
npm start
```

## Notes

- The scraper uses Puppeteer to navigate and extract data from the DOM
- It waits for the positions table to load before scraping
- The scraper handles lazy-loaded content by scrolling the page
- Duplicate positions are automatically removed based on market URL

## Troubleshooting

- If scraping fails, ensure the URL includes `?tab=positions`
- The scraper may take 10-30 seconds depending on page load time
- Make sure you have sufficient system resources for Puppeteer

