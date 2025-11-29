'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, RefreshCw, Loader2, ExternalLink, ArrowUpDown, Filter, X } from 'lucide-react';
import { Position } from './api/scrape/route';

type SortField = 'value' | 'avgPrice' | 'marketName' | 'outcome';
type SortDirection = 'asc' | 'desc';

export default function Home() {
  const [profileUrl, setProfileUrl] = useState('https://polymarket.com/@FirstOrder?tab=positions');
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshIntervalMinutes, setRefreshIntervalMinutes] = useState(1);
  const [timeUntilRefresh, setTimeUntilRefresh] = useState(0);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  // Column filters (Excel-like)
  const [columnFilters, setColumnFilters] = useState({
    marketName: '',
    outcome: '',
    avgPrice: '',
    value: '',
  });
  
  // Range filters for numeric columns
  const [rangeFilters, setRangeFilters] = useState({
    avgPrice: { min: '', max: '' },
    value: { min: '', max: '' },
  });
  
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch positions
  const fetchPositions = async () => {
    if (!profileUrl) {
      setError('Please enter a profile URL');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('Fetching positions for:', profileUrl);
      
      // Create abort controller for timeout (5 minutes for scraping)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes
      
      const response = await fetch(`/api/scrape?profileUrl=${encodeURIComponent(profileUrl)}`, {
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.message || errorData.error || 'Failed to scrape positions');
      }
      
      const data = await response.json();

      // Check if no positions found (but request was successful)
      if (data.positions && data.positions.length === 0) {
        setError(data.message || 'No positions found. Make sure the URL includes ?tab=positions and the profile has active positions.');
        setPositions([]);
      } else {
        console.log('Received positions:', data.positions?.length || 0);
        setPositions(data.positions || []);
        setError(null);
      }
    } catch (err: any) {
      console.error('Error fetching positions:', err);
      if (err.name === 'AbortError') {
        setError('Request timeout. The scraping is taking longer than 5 minutes. This might happen with large profiles. Please try again or check if the profile URL is correct.');
      } else if (err.message) {
        setError(err.message);
      } else {
        setError('An error occurred while scraping. Please check the console for details.');
      }
      setPositions([]);
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh effect with countdown
  useEffect(() => {
    if (!autoRefresh || !profileUrl) {
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

    // Countdown timer
    countdownIntervalRef.current = setInterval(() => {
      setTimeUntilRefresh((prev) => {
        if (prev <= 1) {
          return refreshIntervalMinutes * 60; // Reset to full interval
        }
        return prev - 1;
      });
    }, 1000);

    // Auto-refresh timer
    refreshIntervalRef.current = setInterval(() => {
      fetchPositions();
      setTimeUntilRefresh(refreshIntervalMinutes * 60); // Reset countdown after refresh
    }, intervalMs);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, profileUrl, refreshIntervalMinutes]);

  // Get unique values for column filters (Excel-like)
  const uniqueColumnValues = useMemo(() => {
    return {
      marketName: Array.from(new Set(positions.map(p => p.marketName).filter(Boolean))).sort(),
      outcome: Array.from(new Set(positions.map(p => p.outcome).filter(Boolean))).sort(),
      avgPrice: Array.from(new Set(positions.map(p => p.avgPrice).filter(Boolean))).sort(),
      value: Array.from(new Set(positions.map(p => p.value).filter(Boolean))).sort(),
    };
  }, [positions]);

  // Filtered and sorted positions
  const filteredAndSortedPositions = useMemo(() => {
    let filtered = positions;

    // Apply global search filter
    if (filterText) {
      filtered = filtered.filter((pos) =>
        pos.marketName.toLowerCase().includes(filterText.toLowerCase()) ||
        pos.outcome.toLowerCase().includes(filterText.toLowerCase()) ||
        pos.avgPrice.toLowerCase().includes(filterText.toLowerCase()) ||
        pos.value.toLowerCase().includes(filterText.toLowerCase())
      );
    }

    // Apply column filters (Excel-like)
    if (columnFilters.marketName) {
      filtered = filtered.filter((pos) =>
        pos.marketName.toLowerCase().includes(columnFilters.marketName.toLowerCase())
      );
    }
    if (columnFilters.outcome) {
      filtered = filtered.filter((pos) =>
        pos.outcome.toLowerCase().includes(columnFilters.outcome.toLowerCase())
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
    
    if (columnFilters.avgPrice) {
      filtered = filtered.filter((pos) =>
        pos.avgPrice.toLowerCase().includes(columnFilters.avgPrice.toLowerCase())
      );
    }
    
    // Apply range filter for Avg Price
    if (rangeFilters.avgPrice.min || rangeFilters.avgPrice.max) {
      filtered = filtered.filter((pos) => {
        const priceValue = parseNumericValue(pos.avgPrice);
        const min = rangeFilters.avgPrice.min ? parseFloat(rangeFilters.avgPrice.min) : -Infinity;
        const max = rangeFilters.avgPrice.max ? parseFloat(rangeFilters.avgPrice.max) : Infinity;
        return priceValue >= min && priceValue <= max;
      });
    }
    
    if (columnFilters.value) {
      filtered = filtered.filter((pos) =>
        pos.value.toLowerCase().includes(columnFilters.value.toLowerCase())
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
        } else if (sortField === 'avgPrice') {
          aValue = parseFloat(a.avgPrice.replace(/[^0-9.-]+/g, '')) || 0;
          bValue = parseFloat(b.avgPrice.replace(/[^0-9.-]+/g, '')) || 0;
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
  }, [positions, filterText, columnFilters, rangeFilters, sortField, sortDirection]);

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
  
  const clearRangeFilter = (column: 'avgPrice' | 'value') => {
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
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label htmlFor="profileUrl" className="block text-sm font-medium mb-2">
                Profile URL
              </label>
              <input
                id="profileUrl"
                name="profileUrl"
                type="text"
                value={profileUrl}
                onChange={(e) => setProfileUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !loading) {
                    fetchPositions();
                  }
                }}
                placeholder="https://polymarket.com/@Username?tab=positions"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
                disabled={loading}
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('Scrape button clicked');
                  fetchPositions();
                }}
                disabled={loading || !profileUrl}
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
                    Scrape
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Auto-refresh toggle with interval selection */}
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

              {/* Avg Price Filter */}
              <div className="relative">
                <label className="block text-xs text-gray-400 mb-1">Avg Price</label>
                <div className="space-y-1.5">
                  {/* Text filter */}
                  <div className="relative">
                    <Filter className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400" />
                    <input
                      id="filterPrice"
                      name="filterPrice"
                      type="text"
                      value={columnFilters.avgPrice}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, avgPrice: e.target.value }))}
                      placeholder="Filter avg price..."
                      list="priceOptions"
                      className="w-full pl-7 pr-7 py-1.5 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white text-xs"
                    />
                    {columnFilters.avgPrice && (
                      <button
                        onClick={() => clearColumnFilter('avgPrice')}
                        className="absolute right-1.5 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  {/* Range filter */}
                  <div className="flex gap-1.5 items-center">
                    <input
                      id="filterPriceMin"
                      name="filterPriceMin"
                      type="number"
                      step="0.01"
                      value={rangeFilters.avgPrice.min}
                      onChange={(e) => setRangeFilters(prev => ({ 
                        ...prev, 
                        avgPrice: { ...prev.avgPrice, min: e.target.value } 
                      }))}
                      placeholder="Min"
                      className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white text-xs"
                    />
                    <span className="text-gray-500 text-xs">-</span>
                    <input
                      id="filterPriceMax"
                      name="filterPriceMax"
                      type="number"
                      step="0.01"
                      value={rangeFilters.avgPrice.max}
                      onChange={(e) => setRangeFilters(prev => ({ 
                        ...prev, 
                        avgPrice: { ...prev.avgPrice, max: e.target.value } 
                      }))}
                      placeholder="Max"
                      className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white text-xs"
                    />
                    {(rangeFilters.avgPrice.min || rangeFilters.avgPrice.max) && (
                      <button
                        onClick={() => clearRangeFilter('avgPrice')}
                        className="text-gray-400 hover:text-white p-0.5"
                        title="Clear range"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                <datalist id="priceOptions">
                  {uniqueColumnValues.avgPrice.map((value, idx) => (
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
                  <div className="flex gap-1.5 items-center">
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
                      className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white text-xs"
                    />
                    <span className="text-gray-500 text-xs">-</span>
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
                      className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white text-xs"
                    />
                    {(rangeFilters.value.min || rangeFilters.value.max) && (
                      <button
                        onClick={() => clearRangeFilter('value')}
                        className="text-gray-400 hover:text-white p-0.5"
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
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                      Market
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
                      onClick={() => handleSort('avgPrice')}
                    >
                      <div className="flex items-center gap-2">
                        Avg Price
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
                          {position.avgPrice || '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-300 font-mono">
                          {position.value || '-'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
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

