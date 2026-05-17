import React, { useState, useEffect, useMemo } from 'react';
import { fetchSheetData } from './utils/dataService';
import ListingCard from './components/ListingCard';
import Filters from './components/Filters';

const parseDateSourced = (dateStr) => {
  if (!dateStr) return new Date(0);
  // Expected format: DD/MM/YYYY HH:mm
  const [datePart, timePart] = dateStr.split(' ');
  const [day, month, year] = datePart.split('/').map(Number);
  if (timePart) {
    const [hours, minutes] = timePart.split(':').map(Number);
    return new Date(year, month - 1, day, hours, minutes);
  }
  return new Date(year, month - 1, day);
};

function App() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter states
  const [dateFrom, setDateFrom] = useState('');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedAuthorities, setSelectedAuthorities] = useState([]);
  const [selectedStates, setSelectedStates] = useState([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const data = await fetchSheetData();

        // Default sort by Date Sourced descending
        const sortedData = data.sort((a, b) => {
          return parseDateSourced(b['Date Sourced']) - parseDateSourced(a['Date Sourced']);
        });

        setListings(sortedData);
        setError(null);
      } catch (err) {
        setError('Failed to load data. Please check the spreadsheet access.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const filterOptions = useMemo(() => {
    const categories = new Set();
    const authorities = new Set();
    const states = new Set();

    listings.forEach(item => {
      if (item.Category) categories.add(item.Category);
      if (item.Authority) authorities.add(item.Authority);
      if (item.State) states.add(item.State);
    });

    return {
      categories: Array.from(categories).sort(),
      authorities: Array.from(authorities).sort(),
      states: Array.from(states).sort()
    };
  }, [listings]);

  const filteredListings = useMemo(() => {
    return listings.filter(item => {
      // Date from filter
      if (dateFrom) {
        const itemDate = parseDateSourced(item['Date Sourced']);
        const filterDate = new Date(dateFrom);
        if (itemDate < filterDate) return false;
      }

      // Multi-select Category
      if (selectedCategories.length > 0 && !selectedCategories.includes(item.Category)) {
        return false;
      }

      // Multi-select Authority
      if (selectedAuthorities.length > 0 && !selectedAuthorities.includes(item.Authority)) {
        return false;
      }

      // Multi-select State
      if (selectedStates.length > 0 && !selectedStates.includes(item.State)) {
        return false;
      }

      return true;
    });
  }, [listings, dateFrom, selectedCategories, selectedAuthorities, selectedStates]);

  if (loading) return <div className="flex justify-center items-center h-screen">Loading listings...</div>;
  if (error) return <div className="text-red-500 text-center p-10">{error}</div>;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">Listings Feed</h1>

        <Filters
          options={filterOptions}
          dateFrom={dateFrom}
          setDateFrom={setDateFrom}
          selectedCategories={selectedCategories}
          setSelectedCategories={setSelectedCategories}
          selectedAuthorities={selectedAuthorities}
          setSelectedAuthorities={setSelectedAuthorities}
          selectedStates={selectedStates}
          setSelectedStates={setSelectedStates}
        />

        <div className="mt-8 space-y-4">
          <div className="text-sm text-gray-600 mb-4">
            Showing {filteredListings.length} of {listings.length} listings
          </div>
          {filteredListings.length > 0 ? (
            filteredListings.map((listing, index) => (
              <ListingCard key={listing.ID || index} listing={listing} />
            ))
          ) : (
            <div className="text-center py-20 bg-white rounded-lg shadow">
              <p className="text-gray-500">No listings match your filters.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
