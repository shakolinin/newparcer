import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';

export interface Position {
  marketName: string;
  marketUrl: string;
  outcome: string;
  avgPrice: string;
  value: string;
}

// Increase timeout for this route (5 minutes)
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const profileUrl = searchParams.get('profileUrl');

  if (!profileUrl) {
    return NextResponse.json(
      { error: 'profileUrl parameter is required' },
      { status: 400 }
    );
  }

  // Validate URL
  try {
    new URL(profileUrl);
  } catch {
    return NextResponse.json(
      { error: 'Invalid URL format' },
      { status: 400 }
    );
  }

  let browser;
  try {
    // Launch browser
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Navigate to the page with retry logic
    try {
      await page.goto(profileUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 120000,
      });
    } catch (navError) {
      // Retry with networkidle
      try {
        await page.goto(profileUrl, {
          waitUntil: 'networkidle',
          timeout: 120000,
        });
      } catch {
        // Last resort
        await page.goto(profileUrl, { timeout: 120000 });
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check if page loaded correctly
    const pageTitle = await page.title();
    const pageUrl = page.url();
    
    // Verify we're on the right page
    if (!pageUrl.includes('polymarket.com')) {
      throw new Error('Invalid page: not a Polymarket URL');
    }

    // Wait for market links to appear (with multiple attempts)
    let linksFound = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const linkCount = await page.evaluate(() => {
        return document.querySelectorAll('a[href*="/event/"]').length;
      });
      
      if (linkCount > 0) {
        linksFound = true;
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (!linksFound) {
      // Try waiting for any table or position-related element
      try {
        await page.waitForSelector('table, tbody, [class*="position"]', {
          timeout: 10000,
        });
      } catch {
        // Continue anyway
      }
    }

    // Optimized scrolling to load all content (lazy loading)
    await page.evaluate(async () => {
      const scrollStep = 500; // Increased step for faster scrolling
      const scrollDelay = 300; // Reduced delay
      const maxScrolls = 50; // Reduced max scrolls
      const waitForLoad = 500; // Reduced wait time

      let lastHeight = 0;
      let lastLinkCount = 0;
      let scrollCount = 0;
      let stableCount = 0;

      const countMarketLinks = () => {
        return document.querySelectorAll('a[href*="/event/"]').length;
      };

      while (scrollCount < maxScrolls && stableCount < 3) { // Reduced stable count
        window.scrollBy(0, scrollStep);
        await new Promise((resolve) => setTimeout(resolve, scrollDelay));

        await new Promise((resolve) => setTimeout(resolve, waitForLoad));

        const currentHeight = document.body.scrollHeight;
        const currentLinkCount = countMarketLinks();

        if (currentHeight === lastHeight && currentLinkCount === lastLinkCount) {
          stableCount++;
        } else {
          stableCount = 0;
        }

        lastHeight = currentHeight;
        lastLinkCount = currentLinkCount;
        scrollCount++;
      }

      // Final scroll to bottom
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Scroll back to top
      window.scrollTo(0, 0);
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    // Wait for React to render (reduced wait time)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Log link count before extraction
    const linkCountBefore = await page.evaluate(() => {
      return document.querySelectorAll('a[href*="/event/"]').length;
    });
    console.log(`Found ${linkCountBefore} market links before extraction`);

    // Extract positions data using improved logic
    const positions = await page.evaluate(() => {
      const results: Position[] = [];

      // Find ALL market links (not just with specific classes)
      const allMarketLinks = Array.from(
        document.querySelectorAll('a[href*="/event/"]')
      ) as HTMLAnchorElement[];

      // First try to find links with flex-1 and cursor-pointer (main pattern)
      let marketLinks = allMarketLinks.filter((link) => {
        const classes = link.className || '';
        return (
          classes.includes('flex-1') &&
          classes.includes('cursor-pointer') &&
          link.href.includes('/event/')
        );
      });

      // If not enough links found, use all links
      if (marketLinks.length < 5) {
        marketLinks = allMarketLinks.filter((link) => {
          return link.href && link.href.includes('/event/');
        });
      }

      // For each market link, find its container and extract data
      marketLinks.forEach((link) => {
        try {
          // Find parent container that contains only this market link
          let container: Element | null = null;
          
          // Strategy 1: Try to find tr (table row) that contains this link
          const tr = link.closest('tr');
          if (tr) {
            const linksInTr = tr.querySelectorAll('a[href*="/event/"]');
            if (linksInTr.length === 1 && linksInTr[0] === link) {
              container = tr;
            }
          }
          
          // Strategy 2: Try to find div with position-related classes
          if (!container) {
            const div = link.closest('div[class*="position"]') || 
                       link.closest('div[class*="row"]') ||
                       link.closest('div[role="row"]');
            if (div) {
              const linksInDiv = div.querySelectorAll('a[href*="/event/"]');
              if (linksInDiv.length === 1 && linksInDiv[0] === link) {
                container = div;
              }
            }
          }
          
          // Strategy 3: Find the closest parent that looks like a row/container
          if (!container) {
            let current: Element | null = link.parentElement;
            let depth = 0;
            while (current && depth < 5) {
              const linksInCurrent = current.querySelectorAll('a[href*="/event/"]');
              // If this element contains only our link and has multiple children, it's likely a container
              if (linksInCurrent.length === 1 && 
                  linksInCurrent[0] === link && 
                  current.children.length > 2) {
                container = current;
                break;
              }
              current = current.parentElement;
              depth++;
            }
          }
          
          // Strategy 4: Fallback to parent's parent
          if (!container) {
            container = link.parentElement?.parentElement || link.parentElement;
          }

          if (!container) return;

          // Extract market name and URL
          const marketName = link.innerText?.trim() || link.textContent?.trim() || '';
          let marketUrl = link.href || link.getAttribute('href') || '';
          
          if (marketUrl && !marketUrl.startsWith('http')) {
            if (marketUrl.startsWith('/')) {
              marketUrl = `https://polymarket.com${marketUrl}`;
            } else {
              marketUrl = `https://polymarket.com/${marketUrl}`;
            }
          }

          if (!marketUrl) return;

          // Get full container text and HTML for parsing
          const containerText = container.textContent || container.innerText || '';
          const containerHTML = container.innerHTML || '';

          // If container is a table row, try to extract from cells
          const isTableRow = container.tagName === 'TR';
          const cells = isTableRow ? Array.from(container.querySelectorAll('td, th')) : [];

          // Extract avg price (for exclusion) - look for "at X¢" pattern
          let avgPrice = '';
          const avgPatterns = [
            /at\s+(\d+\.?\d*)\s*¢/i,
            /avg[:\s]+(\d+\.?\d*)\s*¢/i,
            /average[:\s]+(\d+\.?\d*)\s*¢/i,
          ];
          for (const pattern of avgPatterns) {
            const match = containerText.match(pattern);
            if (match && match[1]) {
              avgPrice = match[1];
              break;
            }
          }

          // Extract avg price using multiple strategies
          let avgPriceValue = '';
          
          // Strategy 0: If table row, look for avg price in cells
          if (isTableRow && cells.length > 0) {
            for (const cell of cells) {
              const cellText = cell.textContent || '';
              const cellLower = cellText.toLowerCase();
              // Look for avg price pattern
              if (cellLower.includes('avg') || cellLower.includes('average') || cellLower.includes('at')) {
                const priceMatch = cellText.match(/(\d+\.?\d*)\s*¢/);
                if (priceMatch) {
                  avgPriceValue = priceMatch[0];
                  break;
                }
              }
            }
          }
          
          // Strategy 1: Find all price elements and look for avg
          const priceElements = Array.from(container.querySelectorAll('span, div, p, td, th')).filter(el => {
            const text = el.textContent || '';
            return /\d+\.?\d*\s*¢/.test(text);
          });

          // Strategy 2: Look for price that IS avg
          for (const el of priceElements) {
            const text = el.textContent || '';
            const priceMatch = text.match(/(\d+\.?\d*)\s*¢/);
            if (priceMatch) {
              const fullText = el.textContent || '';
              const parentText = el.parentElement?.textContent || '';
              const context = (fullText + ' ' + parentText).toLowerCase();
              
              // Check if it's avg price
              const isAvg = /at\s+\d+\.?\d*\s*¢/i.test(context) || 
                           /avg[:\s]+\d+\.?\d*\s*¢/i.test(context) ||
                           /average[:\s]+\d+\.?\d*\s*¢/i.test(context);
              
              if (isAvg) {
                avgPriceValue = priceMatch[0];
                break;
              }
            }
          }

          // Strategy 3: Look for avg patterns in text
          if (!avgPriceValue) {
            const avgPatterns = [
              /avg[:\s]+(\d+\.?\d*)\s*¢/i,
              /average[:\s]+(\d+\.?\d*)\s*¢/i,
              /at\s+(\d+\.?\d*)\s*¢/i,
            ];
            
            for (const pattern of avgPatterns) {
              const match = containerText.match(pattern);
              if (match && match[1]) {
                avgPriceValue = `${match[1]}¢`;
                break;
              }
            }
          }
          
          // Strategy 4: If we already found avgPrice earlier, use it
          if (!avgPriceValue && avgPrice) {
            avgPriceValue = `${avgPrice}¢`;
          }

          // Extract value (dollar amount) using multiple strategies
          let value = '';
          
          // Strategy 0: If table row, look for value in cells
          if (isTableRow && cells.length > 0) {
            for (const cell of cells) {
              const cellText = cell.textContent || '';
              const valueMatch = cellText.match(/\$[\d,]+\.?\d*/);
              if (valueMatch) {
                const cellLower = cellText.toLowerCase();
                // Prefer cells with value/PnL context
                if (cellLower.includes('value') || cellLower.includes('pnl') || 
                    cellLower.includes('profit') || cellLower.includes('loss')) {
                  value = valueMatch[0];
                  break;
                } else if (!value) {
                  // Take first dollar amount as fallback
                  value = valueMatch[0];
                }
              }
            }
          }
          
          // Strategy 1: Look for dollar amounts in specific elements
          const valueElements = Array.from(container.querySelectorAll('span, div, p, td, th')).filter(el => {
            const text = el.textContent || '';
            return /\$[\d,]+/.test(text);
          });

          for (const el of valueElements) {
            const text = el.textContent || '';
            const valueMatch = text.match(/\$[\d,]+\.?\d*/);
            if (valueMatch) {
              // Check if it's in a value/PnL context
              const context = (el.textContent || el.parentElement?.textContent || '').toLowerCase();
              if (context.includes('value') || context.includes('pnl') || context.includes('profit') || context.includes('loss')) {
                value = valueMatch[0];
                break;
              } else if (!value) {
                // Take first dollar amount as fallback
                value = valueMatch[0];
              }
            }
          }

          // Strategy 2: Look for value patterns in text
          if (!value) {
            const valuePatterns = [
              /\$[\d,]+\.?\d*/,
              /value[:\s]+\$?([\d,]+\.?\d*)/i,
              /PnL[:\s]+\$?([\d,]+\.?\d*)/i,
              /profit[:\s]+\$?([\d,]+\.?\d*)/i,
              /loss[:\s]+\$?([\d,]+\.?\d*)/i,
            ];

            for (const pattern of valuePatterns) {
              const match = containerText.match(pattern);
              if (match) {
                if (match[1]) {
                  value = `$${match[1]}`;
                } else {
                  value = match[0].replace(/value[:\s]+/i, '').replace(/PnL[:\s]+/i, '').replace(/profit[:\s]+/i, '').replace(/loss[:\s]+/i, '').trim();
                }
                break;
              }
            }
          }

          // Calculate outcome = Value / Avg Price
          // Note: Avg Price is in cents (¢), Value is in dollars ($)
          let outcome = '';
          if (avgPriceValue && value) {
            try {
              // Extract numeric value from avgPriceValue (remove ¢ and parse)
              // Price is in cents, so we need to convert to dollars by dividing by 100
              const priceMatch = avgPriceValue.match(/(\d+\.?\d*)/);
              const priceInCents = priceMatch ? parseFloat(priceMatch[1]) : 0;
              const priceInDollars = priceInCents / 100; // Convert cents to dollars
              
              // Extract numeric value from value (remove $, commas and parse)
              const valueMatch = value.match(/([\d,]+\.?\d*)/);
              const valueStr = valueMatch ? valueMatch[1].replace(/,/g, '') : '0';
              const valueNum = parseFloat(valueStr);
              
              // Calculate outcome = value / avgPrice (both in dollars)
              if (priceInDollars > 0 && !isNaN(valueNum) && !isNaN(priceInDollars)) {
                const outcomeNum = valueNum / priceInDollars;
                // Format with 2 decimal places
                outcome = outcomeNum.toFixed(2);
              }
            } catch (calcError) {
              // If calculation fails, leave outcome empty
              console.error('Error calculating outcome:', calcError);
            }
          }

          // Only add if we have at least market URL
          if (marketUrl) {
            const position = {
              marketName: marketName || 'Unknown Market',
              marketUrl,
              outcome: outcome || '',
              avgPrice: avgPriceValue || '',
              value: value || '',
            };
            
            // Log for debugging (only first few)
            if (results.length < 3) {
              console.log('Parsed position:', {
                market: position.marketName.substring(0, 50),
                outcome: position.outcome || '(empty)',
                avgPrice: position.avgPrice || '(empty)',
                value: position.value || '(empty)',
                calculation: outcome ? `outcome = ${value} / (${avgPriceValue} / 100)` : 'calculation failed',
              });
            }
            
            results.push(position);
          }
        } catch (error) {
          // Skip this position if there's an error
          console.error('Error extracting position:', error);
        }
      });

      // Remove duplicates based on marketUrl
      const uniqueResults: Position[] = [];
      const seenUrls = new Set<string>();

      for (const pos of results) {
        const normalizedUrl = pos.marketUrl.split('?')[0].split('#')[0].toLowerCase().replace(/\/$/, '');
        if (!seenUrls.has(normalizedUrl)) {
          seenUrls.add(normalizedUrl);
          uniqueResults.push(pos);
        }
      }

      return uniqueResults;
    });

    await browser.close();

    // Log results for debugging
    console.log(`Scraped ${positions.length} positions from ${profileUrl}`);

    if (positions.length === 0) {
      return NextResponse.json(
        {
          error: 'No positions found',
          message: 'The page may not have loaded correctly or the profile has no positions. Make sure the URL includes ?tab=positions',
          positions: [],
          count: 0,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ positions, count: positions.length });
  } catch (error: any) {
    console.error('Scraping error:', error);
    
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('Error closing browser:', closeError);
      }
    }

    return NextResponse.json(
      {
        error: 'Scraping failed',
        message: error.message || 'Unknown error occurred',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

