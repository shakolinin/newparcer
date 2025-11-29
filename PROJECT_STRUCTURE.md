# Project Structure

## File Structure

```
new parcer/
├── app/
│   ├── api/
│   │   └── scrape/
│   │       └── route.ts          # API route for scraping Polymarket positions
│   ├── globals.css               # Global Tailwind CSS styles
│   ├── layout.tsx                # Root layout component
│   └── page.tsx                  # Main page with table and controls
├── .eslintrc.json               # ESLint configuration
├── .gitignore                   # Git ignore file
├── next.config.js               # Next.js configuration
├── package.json                 # Dependencies and scripts
├── postcss.config.js            # PostCSS configuration
├── README.md                    # Project documentation
├── setup.sh                     # Setup script
├── tailwind.config.ts           # Tailwind CSS configuration
└── tsconfig.json                # TypeScript configuration
```

## Key Files

### `app/api/scrape/route.ts`
- Handles GET requests to `/api/scrape`
- Uses Puppeteer to scrape Polymarket profile pages
- Extracts positions data from the DOM
- Returns JSON with positions array

### `app/page.tsx`
- Main React component
- Handles user input (profile URL)
- Manages state (positions, loading, error, filters, sorting)
- Implements auto-refresh functionality
- Renders data table with filtering and sorting

### `app/layout.tsx`
- Root layout with dark mode
- Sets page metadata

### `app/globals.css`
- Tailwind CSS imports
- Dark mode color variables
- Global styles

## Data Flow

1. User enters profile URL and clicks "Scrape"
2. Frontend calls `/api/scrape?profileUrl=...`
3. API route launches Puppeteer browser
4. Browser navigates to profile page
5. Waits for positions table to load
6. Scrolls page to load lazy content
7. Extracts position data from DOM
8. Returns JSON response
9. Frontend displays data in table
10. User can filter, sort, and enable auto-refresh

## Position Data Structure

```typescript
interface Position {
  marketName: string;    // Name of the market/event
  marketUrl: string;     // Full URL to the market page
  outcome: string;       // Outcome (Yes, No, Up, Down, etc.)
  currentPrice: string;  // Current price (e.g., "55¢")
  value: string;         // Total value (e.g., "$12,450")
}
```

