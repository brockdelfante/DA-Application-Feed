import React from 'react';

const ListingCard = ({ listing }) => {
  const openDetails = () => {
    if (listing['Detail URL']) {
      window.open(listing['Detail URL'], '_blank');
    }
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow border border-gray-100 hover:border-blue-200 transition-colors">
      {/* Top Row - Meta Info */}
      <div className="flex justify-between items-start mb-3">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">
          {listing['Date Sourced']}
        </div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">
          {listing.Authority} <span className="mx-2 text-gray-300">|</span> {listing.State}
        </div>
        <button
          onClick={openDetails}
          className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold py-1 px-3 rounded shadow-sm transition-all"
        >
          VIEW DETAILS
        </button>
      </div>

      {/* Middle Row - Primary Info */}
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-bold text-gray-900 truncate mr-4">
          {listing.Address}
        </h3>
        <span className="text-xs font-medium bg-gray-100 text-gray-700 px-2 py-0.5 rounded whitespace-nowrap">
          {listing.Category}
        </span>
      </div>

      {/* Bottom Row - Description */}
      <div className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
        {listing.Description}
      </div>
    </div>
  );
};

export default ListingCard;
