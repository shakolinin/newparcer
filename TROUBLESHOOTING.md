# Troubleshooting Guide

## Common Issues

### "Scraping failed" Error

**Possible causes:**
1. **Invalid URL**: Make sure the URL includes `?tab=positions`
2. **Page not loaded**: The page may take longer to load - try again
3. **No positions**: The profile may not have any active positions
4. **Network timeout**: Check your internet connection

**Solutions:**
- Verify the URL format: `https://polymarket.com/@Username?tab=positions`
- Wait a bit longer and try again
- Check if the profile actually has positions by opening it in a browser
- Check browser console for detailed error messages

### "No positions found" Error

**Possible causes:**
1. Profile has no active positions
2. Page structure changed
3. Content not fully loaded

**Solutions:**
- Verify the profile has positions by opening it manually
- Try refreshing the page
- Check if the URL is correct

### Puppeteer Installation Issues

If you see errors about Puppeteer:

```bash
# Reinstall Puppeteer
npm uninstall puppeteer
npm install puppeteer

# Or install Chromium manually
npx puppeteer browsers install chromium
```

### Timeout Errors

If scraping times out:

1. Check your internet connection
2. The page may be slow to load - this is normal for heavy SPAs
3. Try a different profile URL to test

### Debug Mode

To see more detailed error messages, check the browser console (F12) or server logs.

## Testing the API Directly

You can test the API endpoint directly:

```bash
curl "http://localhost:3000/api/scrape?profileUrl=https://polymarket.com/@FirstOrder?tab=positions"
```

## Checking Server Logs

In development mode, check the terminal where `npm run dev` is running for detailed error messages.

## Common Error Messages

- **"profileUrl parameter is required"**: Missing URL parameter
- **"Invalid URL format"**: URL is malformed
- **"No positions found"**: Profile has no positions or page didn't load correctly
- **"Scraping failed"**: General error - check server logs for details

