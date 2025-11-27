import { useState, useMemo } from 'react';
import { usePricingStore } from '../stores/pricingStore';
import type { Instrument } from '../types';

const START_TENORS = ['0D', '1D', '1W', '2W', '1M', '2M', '3M', '6M', '9M', '1Y', '18M', '2Y', '3Y', '5Y'];
const END_TENORS = ['1W', '2W', '1M', '2M', '3M', '6M', '9M', '1Y', '18M', '2Y', '3Y', '4Y', '5Y', '7Y', '10Y', '15Y', '20Y', '25Y', '30Y'];

export function InstrumentBuilder() {
  const {
    instrumentTypes,
    selectedType,
    setSelectedType,
    addInstrument,
    instruments,
    isStreaming,
    selectedCurrency,
  } = usePricingStore();

  const [startTenor, setStartTenor] = useState('0D');
  const [endTenor, setEndTenor] = useState('1Y');

  const canAdd = useMemo(() => {
    if (!selectedType || !startTenor || !endTenor || isStreaming) return false;

    // Check for duplicates
    const exists = instruments.some(
      (i) => i.type === selectedType && i.start === startTenor && i.end === endTenor
    );
    return !exists;
  }, [selectedType, startTenor, endTenor, instruments, isStreaming]);

  const handleAdd = () => {
    if (!canAdd || !selectedType || !selectedCurrency) return;

    const instrument: Instrument = {
      id: `${selectedType}-${startTenor}-${endTenor}-${Date.now()}`,
      type: selectedType,
      start: startTenor,
      end: endTenor,
    };

    addInstrument(instrument);
  };

  const handleAddMultiple = () => {
    if (!selectedType || !selectedCurrency || isStreaming) return;

    // Add a matrix of common instruments
    const starts = ['0D', '1M', '3M', '6M', '1Y'];
    const ends = ['1Y', '2Y', '3Y', '5Y', '10Y'];

    for (const start of starts) {
      for (const end of ends) {
        const exists = instruments.some(
          (i) => i.type === selectedType && i.start === start && i.end === end
        );
        if (!exists) {
          addInstrument({
            id: `${selectedType}-${start}-${end}-${Date.now()}-${Math.random()}`,
            type: selectedType,
            start,
            end,
          });
        }
      }
    }
  };

  if (!selectedCurrency) {
    return (
      <div className="text-trader-muted text-xs p-2">
        Select a currency to add instruments
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2">
        <label className="text-xs text-trader-muted uppercase tracking-wide">Type</label>
        <select
          value={selectedType || ''}
          onChange={(e) => setSelectedType(e.target.value || null)}
          disabled={isStreaming}
          className="bg-trader-panel border border-trader-border rounded px-2 py-1 text-sm
                     text-trader-text focus:border-trader-accent focus:outline-none
                     disabled:opacity-50 disabled:cursor-not-allowed min-w-[100px]"
        >
          <option value="">Select...</option>
          {instrumentTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-trader-muted uppercase tracking-wide">Start</label>
        <select
          value={startTenor}
          onChange={(e) => setStartTenor(e.target.value)}
          disabled={isStreaming || !selectedType}
          className="bg-trader-panel border border-trader-border rounded px-2 py-1 text-sm
                     text-trader-text focus:border-trader-accent focus:outline-none
                     disabled:opacity-50 disabled:cursor-not-allowed min-w-[70px]"
        >
          {START_TENORS.map((tenor) => (
            <option key={tenor} value={tenor}>
              {tenor}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-trader-muted uppercase tracking-wide">End</label>
        <select
          value={endTenor}
          onChange={(e) => setEndTenor(e.target.value)}
          disabled={isStreaming || !selectedType}
          className="bg-trader-panel border border-trader-border rounded px-2 py-1 text-sm
                     text-trader-text focus:border-trader-accent focus:outline-none
                     disabled:opacity-50 disabled:cursor-not-allowed min-w-[70px]"
        >
          {END_TENORS.map((tenor) => (
            <option key={tenor} value={tenor}>
              {tenor}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={handleAdd}
        disabled={!canAdd}
        className="px-3 py-1 text-sm bg-trader-accent text-white rounded
                   hover:bg-opacity-80 disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors"
      >
        Add
      </button>

      <button
        onClick={handleAddMultiple}
        disabled={!selectedType || isStreaming}
        className="px-3 py-1 text-sm bg-trader-border text-trader-text rounded
                   hover:bg-opacity-80 disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors"
      >
        Add Grid
      </button>
    </div>
  );
}
