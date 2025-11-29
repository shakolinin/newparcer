'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, RefreshCw, Loader2, ExternalLink, ArrowUpDown, Filter, X } from 'lucide-react';
import { Position } from './api/scrape/route';

type SortField = 'value' | 'currentPrice' | 'marketName' | 'outcome' | 'trader';
type SortDirection = 'asc' | 'desc';

export default function Home() {
  const [profileUrls, setProfileUrls] = useState<string[]>(['https://polymarket.com/@FirstOrder?tab=positions', '', '']);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<{ [index: number]: { loading: boolean; error: string | null } }>({});
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [debouncedFilterText, setDebouncedFilterText] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshIntervalMinutes, setRefreshIntervalMinutes] = useState(1);
  const [timeUntilRefresh, setTimeUntilRefresh] = useState(0);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  // Column filters (Excel-like)
  const [columnFilters, setColumnFilters] = useState({
    trader: '',
    marketName: '',
    outcome: '',
    currentPrice: '',
    value: '',
  });
  
  // Debounced column filters
  const [debouncedColumnFilters, setDebouncedColumnFilters] = useState({
    trader: '',
    marketName: '',
    outcome: '',
    currentPrice: '',
    value: '',
  });
  
  // Range filters for numeric columns
  const [rangeFilters, setRangeFilters] = useState({
    currentPrice: { min: '', max: '' },
    value: { min: '', max: '' },
  });
  
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimersRef = useRef<{ [key: string]: NodeJS.Timeout }>({});
  const isLoadingRef = useRef<boolean>(false);

  // Cache key generator
  const getCacheKey = (url: string) => `positions_cache_${url}`;
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // Clear cache when profile URL changes
  useEffect(() => {
    // Clear all position caches when URL changes (optional - can be removed if you want to keep cache)
    // This ensures fresh data when switching profiles
    return () => {
      // Cache will be checked on next fetch, expired entries will be removed automatically
    };
  }, [profileUrls]);

  // Fetch single profile positions
  const fetchSingleProfile = async (url: string, index: number): Promise<Position[]> => {
    if (!url || !url.trim()) {
      return [];
    }

    // Always fetch fresh data - don't use cache to skip scraping
    // Cache is only used for storing results after scraping
    const cacheKey = getCacheKey(url);
    setLoadingStatus(prev => ({ ...prev, [index]: { loading: true, error: null } }));

    try {
      console.log(`[Profile ${index + 1}] Fetching positions for:`, url);
      
      // Create abort controller for timeout (5 minutes for scraping)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes
      
      const response = await fetch(`/api/scrape?profileUrl=${encodeURIComponent(url)}`, {
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      // Check if request was aborted
      if (controller.signal.aborted) {
        return [];
      }
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.message || errorData.error || 'Failed to scrape positions');
      }
      
      const data = await response.json();

      // Check if request was aborted after response
      if (controller.signal.aborted) {
        return [];
      }

      // Check if no positions found (but request was successful)
      if (data.positions && data.positions.length === 0) {
        setLoadingStatus(prev => ({ 
          ...prev, 
          [index]: { 
            loading: false, 
            error: data.message || 'No positions found' 
          } 
        }));
        return [];
      }

      console.log(`[Profile ${index + 1}] Received positions:`, data.positions?.length || 0);
      setLoadingStatus(prev => ({ ...prev, [index]: { loading: false, error: null } }));
      
      // Cache the results
      try {
        localStorage.setItem(cacheKey, JSON.stringify({
          data,
          timestamp: Date.now(),
        }));
        console.log(`[Profile ${index + 1}] Data cached successfully`);
      } catch (e) {
        console.warn(`[Profile ${index + 1}] Error caching data:`, e);
      }

      return data.positions || [];
    } catch (err: any) {
      // Don't show error if request was aborted
      if (err.name === 'AbortError') {
        console.log(`[Profile ${index + 1}] Request aborted`);
        setLoadingStatus(prev => ({ ...prev, [index]: { loading: false, error: null } }));
        return [];
      }
      
      console.error(`[Profile ${index + 1}] Error fetching positions:`, err);
      const errorMessage = err.name === 'AbortError' 
        ? 'Request timeout (5 minutes exceeded)'
        : err.message || 'An error occurred while scraping';
      
      setLoadingStatus(prev => ({ 
        ...prev, 
        [index]: { loading: false, error: errorMessage } 
      }));
      
      return [];
    }
  };

  // Fetch positions with caching and duplicate request protection (supports multiple URLs)
  const fetchPositions = useCallback(async () => {
    // Protection: prevent duplicate requests using ref instead of state
    if (isLoadingRef.current) {
      console.log('Request already in progress, skipping...');
      return;
    }

    // Filter out empty URLs
    const validUrls = profileUrls.filter(url => url && url.trim());
    
    if (validUrls.length === 0) {
      setError('Please enter at least one profile URL');
      return;
    }

    // Limit to 3 URLs
    const urlsToProcess = validUrls.slice(0, 3);
    
    isLoadingRef.current = true;
    setLoading(true);
    setError(null);
    setPositions([]);
    
    // Initialize loading status for all URLs
    const initialStatus: { [index: number]: { loading: boolean; error: string | null } } = {};
    urlsToProcess.forEach((_, index) => {
      initialStatus[index] = { loading: true, error: null };
    });
    setLoadingStatus(initialStatus);

    try {
      // Process up to 3 URLs in parallel
      const promises = urlsToProcess.map((url, index) => fetchSingleProfile(url, index));
      const results = await Promise.allSettled(promises);
      
      // Combine all results
      const allPositions: Position[] = [];
      const errors: string[] = [];
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          allPositions.push(...result.value);
        } else {
          const errorMsg = result.reason?.message || `Failed to fetch profile ${index + 1}`;
          errors.push(`Profile ${index + 1}: ${errorMsg}`);
        }
      });

      // Remove duplicates based on marketUrl
      const uniquePositions = allPositions.reduce((acc, pos) => {
        const normalizedUrl = pos.marketUrl.split('?')[0].split('#')[0].toLowerCase().replace(/\/$/, '');
        if (!acc.find(p => {
          const pUrl = p.marketUrl.split('?')[0].split('#')[0].toLowerCase().replace(/\/$/, '');
          return pUrl === normalizedUrl;
        })) {
          acc.push(pos);
        }
        return acc;
      }, [] as Position[]);

      setPositions(uniquePositions);
      
      if (errors.length > 0 && uniquePositions.length === 0) {
        setError(errors.join('; '));
      } else if (errors.length > 0) {
        // Show warning but don't block if we have some results
        console.warn('Some profiles failed:', errors);
      } else {
        setError(null);
      }
    } catch (err: any) {
      console.error('Error in fetchPositions:', err);
      setError(err.message || 'An error occurred while scraping');
      setPositions([]);
    } finally {
      isLoadingRef.current = false;
      setLoading(false);
    }
  }, [profileUrls]);

  // Auto-refresh effect with countdown
  useEffect(() => {
    const hasValidUrls = profileUrls.some(url => url && url.trim());
    // Only enable auto-refresh if we have positions loaded
    if (!autoRefresh || !hasValidUrls || positions.length === 0) {
      setTimeUntilRefresh(0);
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      return;
    }

    const intervalMs = refreshIntervalMinutes * 60 * 1000;
    setTimeUntilRefresh(refreshIntervalMinutes * 60); // Set initial countdown in seconds

    // Countdown timer - when reaches 0, trigger fetchPositions
    countdownIntervalRef.current = setInterval(() => {
      setTimeUntilRefresh((prev) => {
        if (prev <= 1) {
          // When countdown reaches 0, trigger fetchPositions (like clicking "Scrape All")
          fetchPositions();
          return refreshIntervalMinutes * 60; // Reset to full interval
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [autoRefresh, profileUrls, refreshIntervalMinutes, fetchPositions, positions.length]);

  // Get unique values for column filters (Excel-like)
  const uniqueColumnValues = useMemo(() => {
    return {
      trader: Array.from(new Set(positions.map(p => p.trader).filter(Boolean))).sort(),
      marketName: Array.from(new Set(positions.map(p => p.marketName).filter(Boolean))).sort(),
      outcome: Array.from(new Set(positions.map(p => p.outcome).filter(Boolean))).sort(),
      currentPrice: Array.from(new Set(positions.map(p => p.currentPrice).filter(Boolean))).sort(),
      value: Array.from(new Set(positions.map(p => p.value).filter(Boolean))).sort(),
    };
  }, [positions]);

  // Debounce filter text (400ms)
  useEffect(() => {
    const timer = debounceTimersRef.current['filterText'];
    if (timer) {
      clearTimeout(timer);
    }
    
    debounceTimersRef.current['filterText'] = setTimeout(() => {
      setDebouncedFilterText(filterText);
    }, 400);
    
    return () => {
      if (debounceTimersRef.current['filterText']) {
        clearTimeout(debounceTimersRef.current['filterText']);
      }
    };
  }, [filterText]);

  // Debounce column filters (400ms)
  useEffect(() => {
    const timer = debounceTimersRef.current['columnFilters'];
    if (timer) {
      clearTimeout(timer);
    }
    
    debounceTimersRef.current['columnFilters'] = setTimeout(() => {
      setDebouncedColumnFilters(columnFilters);
    }, 400);
    
    return () => {
      if (debounceTimersRef.current['columnFilters']) {
        clearTimeout(debounceTimersRef.current['columnFilters']);
      }
    };
  }, [columnFilters]);

  // Filtered and sorted positions
  const filteredAndSortedPositions = useMemo(() => {
    let filtered = positions;

    // Apply global search filter (using debounced value)
    if (debouncedFilterText) {
      filtered = filtered.filter((pos) =>
        pos.trader.toLowerCase().includes(debouncedFilterText.toLowerCase()) ||
        pos.marketName.toLowerCase().includes(debouncedFilterText.toLowerCase()) ||
        pos.outcome.toLowerCase().includes(debouncedFilterText.toLowerCase()) ||
        pos.currentPrice.toLowerCase().includes(debouncedFilterText.toLowerCase()) ||
        pos.value.toLowerCase().includes(debouncedFilterText.toLowerCase())
      );
    }

    // Apply column filters (Excel-like) (using debounced values)
    if (debouncedColumnFilters.trader) {
      filtered = filtered.filter((pos) =>
        pos.trader.toLowerCase().includes(debouncedColumnFilters.trader.toLowerCase())
      );
    }
    if (debouncedColumnFilters.marketName) {
      filtered = filtered.filter((pos) =>
        pos.marketName.toLowerCase().includes(debouncedColumnFilters.marketName.toLowerCase())
      );
    }
    if (debouncedColumnFilters.outcome) {
      filtered = filtered.filter((pos) =>
        pos.outcome.toLowerCase().includes(debouncedColumnFilters.outcome.toLowerCase())
      );
    }
    // Helper function to parse numeric value from string (handles $, commas, ¢)
    const parseNumericValue = (str: string): number => {
      if (!str) return 0;
      
      // Check if it's in cents (contains ¢ symbol)
      if (str.includes('¢')) {
        // Remove ¢ and parse as cents, then convert to dollars
        const cleaned = str.replace(/[¢,\s]/g, '');
        return parseFloat(cleaned) / 100 || 0;
      }
      
      // Remove currency symbols, commas, and whitespace
      const cleaned = str.replace(/[$,\s]/g, '');
      return parseFloat(cleaned) || 0;
    };
    
    if (debouncedColumnFilters.currentPrice) {
      filtered = filtered.filter((pos) =>
        pos.currentPrice.toLowerCase().includes(debouncedColumnFilters.currentPrice.toLowerCase())
      );
    }
    
    // Apply range filter for Current Price
    if (rangeFilters.currentPrice.min || rangeFilters.currentPrice.max) {
      filtered = filtered.filter((pos) => {
        const priceValue = parseNumericValue(pos.currentPrice);
        const min = rangeFilters.currentPrice.min ? parseFloat(rangeFilters.currentPrice.min) : -Infinity;
        const max = rangeFilters.currentPrice.max ? parseFloat(rangeFilters.currentPrice.max) : Infinity;
        return priceValue >= min && priceValue <= max;
      });
    }
    
    if (debouncedColumnFilters.value) {
      filtered = filtered.filter((pos) =>
        pos.value.toLowerCase().includes(debouncedColumnFilters.value.toLowerCase())
      );
    }
    
    // Apply range filter for Value
    if (rangeFilters.value.min || rangeFilters.value.max) {
      filtered = filtered.filter((pos) => {
        const valueNum = parseNumericValue(pos.value);
        const min = rangeFilters.value.min ? parseFloat(rangeFilters.value.min) : -Infinity;
        const max = rangeFilters.value.max ? parseFloat(rangeFilters.value.max) : Infinity;
        return valueNum >= min && valueNum <= max;
      });
    }

    // Apply sorting
    if (sortField) {
      filtered = [...filtered].sort((a, b) => {
        let aValue: string | number = '';
        let bValue: string | number = '';

        if (sortField === 'value') {
          aValue = parseFloat(a.value.replace(/[^0-9.-]+/g, '')) || 0;
          bValue = parseFloat(b.value.replace(/[^0-9.-]+/g, '')) || 0;
        } else if (sortField === 'currentPrice') {
          aValue = parseFloat(a.currentPrice.replace(/[^0-9.-]+/g, '')) || 0;
          bValue = parseFloat(b.currentPrice.replace(/[^0-9.-]+/g, '')) || 0;
        } else if (sortField === 'trader') {
          aValue = a.trader.toLowerCase();
          bValue = b.trader.toLowerCase();
        } else if (sortField === 'marketName') {
          aValue = a.marketName.toLowerCase();
          bValue = b.marketName.toLowerCase();
        } else if (sortField === 'outcome') {
          aValue = a.outcome.toLowerCase();
          bValue = b.outcome.toLowerCase();
        }

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortDirection === 'asc'
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue);
        }

        return sortDirection === 'asc' ? (aValue as number) - (bValue as number) : (bValue as number) - (aValue as number);
      });
    }

    return filtered;
  }, [positions, debouncedFilterText, debouncedColumnFilters, rangeFilters, sortField, sortDirection]);

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Format countdown time
  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Clear column filter
  const clearColumnFilter = (column: keyof typeof columnFilters) => {
    setColumnFilters((prev) => ({ ...prev, [column]: '' }));
  };
  
  const clearRangeFilter = (column: 'currentPrice' | 'value') => {
    setRangeFilters((prev) => ({ 
      ...prev, 
      [column]: { min: '', max: '' } 
    }));
  };

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold mb-8 text-center">
          Polymarket Positions Parser
        </h1>

        {/* Input Section */}
        <div className="bg-gray-900 rounded-lg p-6 mb-6 border border-gray-800">
          <div className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Profile URLs (up to 3)</h2>
            <p className="text-sm text-gray-400 mb-4">
              Enter up to 3 profile URLs to scrape simultaneously. All processes will run in parallel.
            </p>
          </div>
          
          <div className="space-y-3 mb-4">
            {profileUrls.map((url, index) => (
              <div key={index} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <label htmlFor={`profileUrl${index}`} className="block text-sm font-medium min-w-[80px]">
                    Profile {index + 1}:
                  </label>
                  <div className="flex-1 relative">
                    <input
                      id={`profileUrl${index}`}
                      name={`profileUrl${index}`}
                      type="text"
                      value={url}
                      onChange={(e) => {
                        const newUrls = [...profileUrls];
                        newUrls[index] = e.target.value;
                        setProfileUrls(newUrls);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !loading) {
                          fetchPositions();
                        }
                      }}
                      placeholder="https://polymarket.com/@Username?tab=positions"
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
                      disabled={loading}
                    />
                    {loadingStatus[index]?.loading && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      </div>
                    )}
                  </div>
                </div>
                {loadingStatus[index]?.error && (
                  <div className="ml-[88px] text-sm text-red-400">
                    Error: {loadingStatus[index].error}
                  </div>
                )}
              </div>
            ))}
          </div>
          
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Scrape button clicked, loading:', loading, 'isLoadingRef:', isLoadingRef.current);
                if (!isLoadingRef.current) {
                  fetchPositions();
                } else {
                  console.log('Button click ignored - request in progress');
                }
              }}
              disabled={loading || !profileUrls.some(url => url && url.trim())}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-medium flex items-center gap-2 transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Scraping...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Scrape All ({profileUrls.filter(url => url && url.trim()).length} URL{profileUrls.filter(url => url && url.trim()).length !== 1 ? 's' : ''})
                </>
              )}
            </button>
            {loading && (
              <div className="text-sm text-gray-400">
                Processing {Object.values(loadingStatus).filter(s => s.loading).length} profile(s)...
              </div>
            )}
          </div>

          {/* Auto-refresh toggle with interval selection - only show after data is loaded */}
          {positions.length > 0 && (
            <div className="mt-4 flex flex-col md:flex-row items-start md:items-center gap-4">
              <label htmlFor="autoRefresh" className="flex items-center gap-2 cursor-pointer">
                <input
                  id="autoRefresh"
                  name="autoRefresh"
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm">Auto-refresh every</span>
              </label>
              <div className="flex items-center gap-2">
                <select
                  id="refreshInterval"
                  name="refreshInterval"
                  value={refreshIntervalMinutes}
                  onChange={(e) => setRefreshIntervalMinutes(Number(e.target.value))}
                  disabled={!autoRefresh}
                  className="px-3 py-1 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value={0.5}>30 seconds</option>
                  <option value={1}>1 minute</option>
                  <option value={2}>2 minutes</option>
                  <option value={5}>5 minutes</option>
                  <option value={10}>10 minutes</option>
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>1 hour</option>
                </select>
                {autoRefresh && timeUntilRefresh > 0 && (
                  <span className="text-sm text-blue-400 font-mono">
                    Next refresh in: {formatCountdown(timeUntilRefresh)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-6">
            <p className="text-red-200">{error}</p>
          </div>
        )}

        {/* Filter Section */}
        {positions.length > 0 && (
          <div className="bg-gray-900 rounded-lg p-4 mb-6 border border-gray-800">
            {/* Global Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="filterText"
                name="filterText"
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Search across all columns..."
                className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
              />
            </div>
            
            {/* Column Filters (Excel-like) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Trader Filter */}
              <div className="relative">
                <label className="block text-xs text-gray-400 mb-1">Trader</label>
                <div className="relative">
                  <Filter className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400" />
                  <input
                    id="filterTrader"
                    name="filterTrader"
                    type="text"
                    value={columnFilters.trader}
                    onChange={(e) => setColumnFilters(prev => ({ ...prev, trader: e.target.value }))}
                    placeholder="Filter trader..."
                    list="traderOptions"
                    className="w-full pl-7 pr-7 py-1.5 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white text-xs"
                  />
                  {columnFilters.trader && (
                    <button
                      onClick={() => clearColumnFilter('trader')}
                      className="absolute right-1.5 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <datalist id="traderOptions">
                  {uniqueColumnValues.trader.map((value, idx) => (
                    <option key={idx} value={value} />
                  ))}
                </datalist>
              </div>

              {/* Market Name Filter */}
              <div className="relative">
                <label className="block text-xs text-gray-400 mb-1">Market</label>
                <div className="relative">
                  <Filter className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400" />
                  <input
                    id="filterMarket"
                    name="filterMarket"
                    type="text"
                    value={columnFilters.marketName}
                    onChange={(e) => setColumnFilters(prev => ({ ...prev, marketName: e.target.value }))}
                    placeholder="Filter market..."
                    list="marketOptions"
                    className="w-full pl-7 pr-7 py-1.5 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white text-xs"
                  />
                  {columnFilters.marketName && (
                    <button
                      onClick={() => clearColumnFilter('marketName')}
                      className="absolute right-1.5 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <datalist id="marketOptions">
                  {uniqueColumnValues.marketName.map((value, idx) => (
                    <option key={idx} value={value} />
                  ))}
                </datalist>
              </div>

              {/* Outcome Filter */}
              <div className="relative">
                <label className="block text-xs text-gray-400 mb-1">Outcome</label>
                <div className="relative">
                  <Filter className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400" />
                  <input
                    id="filterOutcome"
                    name="filterOutcome"
                    type="text"
                    value={columnFilters.outcome}
                    onChange={(e) => setColumnFilters(prev => ({ ...prev, outcome: e.target.value }))}
                    placeholder="Filter outcome..."
                    list="outcomeOptions"
                    className="w-full pl-7 pr-7 py-1.5 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white text-xs"
                  />
                  {columnFilters.outcome && (
                    <button
                      onClick={() => clearColumnFilter('outcome')}
                      className="absolute right-1.5 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <datalist id="outcomeOptions">
                  {uniqueColumnValues.outcome.map((value, idx) => (
                    <option key={idx} value={value} />
                  ))}
                </datalist>
              </div>

              {/* Current Price Filter */}
              <div className="relative">
                <label className="block text-xs text-gray-400 mb-1">Current Price</label>
                <div className="space-y-1.5">
                  {/* Text filter */}
                  <div className="relative">
                    <Filter className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400" />
                    <input
                      id="filterPrice"
                      name="filterPrice"
                      type="text"
                      value={columnFilters.currentPrice}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, currentPrice: e.target.value }))}
                      placeholder="Filter price..."
                      list="priceOptions"
                      className="w-full pl-7 pr-7 py-1.5 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white text-xs"
                    />
                    {columnFilters.currentPrice && (
                      <button
                        onClick={() => clearColumnFilter('currentPrice')}
                        className="absolute right-1.5 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  {/* Range filter */}
                  <div className="flex gap-1 items-center w-full">
                    <input
                      id="filterPriceMin"
                      name="filterPriceMin"
                      type="number"
                      step="0.01"
                      value={rangeFilters.currentPrice.min}
                      onChange={(e) => setRangeFilters(prev => ({ 
                        ...prev, 
                        currentPrice: { ...prev.currentPrice, min: e.target.value } 
                      }))}
                      placeholder="Min"
                      className="flex-1 min-w-0 px-1.5 md:px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white text-xs"
                    />
                    <span className="text-gray-500 text-xs flex-shrink-0 px-0.5">-</span>
                    <input
                      id="filterPriceMax"
                      name="filterPriceMax"
                      type="number"
                      step="0.01"
                      value={rangeFilters.currentPrice.max}
                      onChange={(e) => setRangeFilters(prev => ({ 
                        ...prev, 
                        currentPrice: { ...prev.currentPrice, max: e.target.value } 
                      }))}
                      placeholder="Max"
                      className="flex-1 min-w-0 px-1.5 md:px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white text-xs"
                    />
                    {(rangeFilters.currentPrice.min || rangeFilters.currentPrice.max) && (
                      <button
                        onClick={() => clearRangeFilter('currentPrice')}
                        className="text-gray-400 hover:text-white p-0.5 flex-shrink-0"
                        title="Clear range"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                <datalist id="priceOptions">
                  {uniqueColumnValues.currentPrice.map((value, idx) => (
                    <option key={idx} value={value} />
                  ))}
                </datalist>
              </div>

              {/* Value Filter */}
              <div className="relative">
                <label className="block text-xs text-gray-400 mb-1">Value</label>
                <div className="space-y-1.5">
                  {/* Text filter */}
                  <div className="relative">
                    <Filter className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400" />
                    <input
                      id="filterValue"
                      name="filterValue"
                      type="text"
                      value={columnFilters.value}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, value: e.target.value }))}
                      placeholder="Filter value..."
                      list="valueOptions"
                      className="w-full pl-7 pr-7 py-1.5 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white text-xs"
                    />
                    {columnFilters.value && (
                      <button
                        onClick={() => clearColumnFilter('value')}
                        className="absolute right-1.5 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  {/* Range filter */}
                  <div className="flex gap-1 items-center w-full">
                    <input
                      id="filterValueMin"
                      name="filterValueMin"
                      type="number"
                      step="0.01"
                      value={rangeFilters.value.min}
                      onChange={(e) => setRangeFilters(prev => ({ 
                        ...prev, 
                        value: { ...prev.value, min: e.target.value } 
                      }))}
                      placeholder="Min"
                      className="flex-1 min-w-0 px-1.5 md:px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white text-xs"
                    />
                    <span className="text-gray-500 text-xs flex-shrink-0 px-0.5">-</span>
                    <input
                      id="filterValueMax"
                      name="filterValueMax"
                      type="number"
                      step="0.01"
                      value={rangeFilters.value.max}
                      onChange={(e) => setRangeFilters(prev => ({ 
                        ...prev, 
                        value: { ...prev.value, max: e.target.value } 
                      }))}
                      placeholder="Max"
                      className="flex-1 min-w-0 px-1.5 md:px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white text-xs"
                    />
                    {(rangeFilters.value.min || rangeFilters.value.max) && (
                      <button
                        onClick={() => clearRangeFilter('value')}
                        className="text-gray-400 hover:text-white p-0.5 flex-shrink-0"
                        title="Clear range"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                <datalist id="valueOptions">
                  {uniqueColumnValues.value.map((value, idx) => (
                    <option key={idx} value={value} />
                  ))}
                </datalist>
              </div>
            </div>

            <p className="text-sm text-gray-400 mt-3">
              Showing {filteredAndSortedPositions.length} of {positions.length} positions
            </p>
          </div>
        )}

        {/* Table */}
        {positions.length > 0 ? (
          <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-800 border-b border-gray-700">
                  <tr>
                    <th
                      className="px-4 py-3 text-left text-sm font-semibold text-gray-300 cursor-pointer hover:bg-gray-750 transition-colors"
                      onClick={() => handleSort('trader')}
                    >
                      <div className="flex items-center gap-2">
                        Trader
                        <ArrowUpDown className="w-4 h-4" />
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-sm font-semibold text-gray-300 cursor-pointer hover:bg-gray-750 transition-colors"
                      onClick={() => handleSort('marketName')}
                    >
                      <div className="flex items-center gap-2">
                        Market
                        <ArrowUpDown className="w-4 h-4" />
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-sm font-semibold text-gray-300 cursor-pointer hover:bg-gray-750 transition-colors"
                      onClick={() => handleSort('outcome')}
                    >
                      <div className="flex items-center gap-2">
                        Outcome
                        <ArrowUpDown className="w-4 h-4" />
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-sm font-semibold text-gray-300 cursor-pointer hover:bg-gray-750 transition-colors"
                      onClick={() => handleSort('currentPrice')}
                    >
                      <div className="flex items-center gap-2">
                        Current Price
                        <ArrowUpDown className="w-4 h-4" />
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-sm font-semibold text-gray-300 cursor-pointer hover:bg-gray-750 transition-colors"
                      onClick={() => handleSort('value')}
                    >
                      <div className="flex items-center gap-2">
                        Current Value
                        <ArrowUpDown className="w-4 h-4" />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filteredAndSortedPositions.length > 0 ? (
                    filteredAndSortedPositions.map((position, index) => (
                      <tr
                        key={`${position.marketUrl}-${index}`}
                        className="hover:bg-gray-800/50 transition-colors"
                      >
                        <td className="px-4 py-3 text-gray-300 font-medium">
                          {position.trader || '-'}
                        </td>
                        <td className="px-4 py-3">
                          <a
                            href={position.marketUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 flex items-center gap-1 group"
                          >
                            {position.marketName || 'Unknown Market'}
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </a>
                        </td>
                        <td className="px-4 py-3 text-gray-300">
                          {position.outcome || '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-300 font-mono">
                          {position.currentPrice || '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-300 font-mono">
                          {position.value || '-'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                        No positions match the filter criteria
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          !loading && (
            <div className="bg-gray-900 rounded-lg border border-gray-800 p-12 text-center">
              <p className="text-gray-400">
                Enter a profile URL and click "Scrape" to get started
              </p>
            </div>
          )
        )}

        {/* Loading State */}
        {loading && positions.length === 0 && (
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-500" />
            <p className="text-gray-400 mb-2">Scraping positions... This may take up to 5 minutes.</p>
            <p className="text-sm text-gray-500">Please wait while we load all positions from the profile.</p>
          </div>
        )}
      </div>
    </main>
  );
}

