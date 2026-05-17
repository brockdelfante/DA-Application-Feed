import React from 'react';
import { ChevronDown, X } from 'lucide-react';

const MultiSelect = ({ label, options, selected, onChange }) => {
  const [isOpen, setIsOpen] = React.useState(false);

  const toggleOption = (option) => {
    if (selected.includes(option)) {
      onChange(selected.filter(item => item !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  const removeOption = (option, e) => {
    e.stopPropagation();
    onChange(selected.filter(item => item !== option));
  };

  return (
    <div className="relative flex-1 min-w-[200px]">
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <div
        className="min-h-[42px] p-1 border rounded bg-white flex flex-wrap gap-1 items-center cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        {selected.length === 0 ? (
          <span className="text-gray-400 text-sm px-2">
            All {label === 'Category' ? 'Categories' : label === 'Authority' ? 'Authorities' : label + 's'}
          </span>
        ) : (
          selected.map(item => (
            <span key={item} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded flex items-center gap-1">
              {item}
              <X size={12} className="cursor-pointer" onClick={(e) => removeOption(item, e)} />
            </span>
          ))
        )}
        <ChevronDown size={16} className="ml-auto mr-1 text-gray-400" />
      </div>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)}></div>
          <div className="absolute z-20 w-full mt-1 bg-white border rounded shadow-lg max-h-60 overflow-auto">
            {options.map(option => (
              <div
                key={option}
                className={`px-4 py-2 text-sm cursor-pointer hover:bg-gray-100 flex items-center gap-2 ${selected.includes(option) ? 'bg-blue-50 text-blue-700' : ''}`}
                onClick={() => toggleOption(option)}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  readOnly
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                {option}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const Filters = ({
  options,
  dateFrom, setDateFrom,
  selectedCategories, setSelectedCategories,
  selectedAuthorities, setSelectedAuthorities,
  selectedStates, setSelectedStates
}) => {
  return (
    <div className="bg-white p-6 rounded-lg shadow-sm space-y-4">
      <h2 className="text-sm font-semibold text-gray-900 border-b pb-2 mb-4">Filters</h2>
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-700 mb-1">Date Sourced From</label>
          <input
            type="date"
            className="w-full p-2 border rounded text-sm h-[42px]"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>

        <MultiSelect
          label="Category"
          options={options.categories}
          selected={selectedCategories}
          onChange={setSelectedCategories}
        />

        <MultiSelect
          label="Authority"
          options={options.authorities}
          selected={selectedAuthorities}
          onChange={setSelectedAuthorities}
        />

        <MultiSelect
          label="State"
          options={options.states}
          selected={selectedStates}
          onChange={setSelectedStates}
        />
      </div>

      {(dateFrom || selectedCategories.length > 0 || selectedAuthorities.length > 0 || selectedStates.length > 0) && (
        <button
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          onClick={() => {
            setDateFrom('');
            setSelectedCategories([]);
            setSelectedAuthorities([]);
            setSelectedStates([]);
          }}
        >
          Clear all filters
        </button>
      )}
    </div>
  );
};

export default Filters;
