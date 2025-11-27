import { usePricingStore } from '../stores/pricingStore';
import { useSignalR } from '../hooks/useSignalR';
import * as signalR from '@microsoft/signalr';

export function StreamControls() {
  const { isStreaming, instruments, selectedCurrency } = usePricingStore();
  const { startStream, stopStream, connectionState } = useSignalR();

  const canStart =
    connectionState === signalR.HubConnectionState.Connected &&
    !isStreaming &&
    instruments.length > 0 &&
    selectedCurrency;

  const handleToggle = () => {
    if (isStreaming) {
      stopStream();
    } else {
      startStream();
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleToggle}
        disabled={!canStart && !isStreaming}
        className={`px-4 py-1.5 text-sm font-medium rounded transition-colors
                    ${isStreaming
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-600 disabled:cursor-not-allowed'
                    }`}
      >
        {isStreaming ? 'Stop' : 'Start'}
      </button>

      <div className="flex items-center gap-1.5">
        <div
          className={`w-2 h-2 rounded-full ${
            connectionState === signalR.HubConnectionState.Connected
              ? 'bg-green-500'
              : connectionState === signalR.HubConnectionState.Reconnecting
              ? 'bg-yellow-500 animate-pulse'
              : 'bg-red-500'
          }`}
        />
        <span className="text-xs text-trader-muted">
          {connectionState === signalR.HubConnectionState.Connected
            ? 'Connected'
            : connectionState === signalR.HubConnectionState.Reconnecting
            ? 'Reconnecting...'
            : 'Disconnected'}
        </span>
      </div>
    </div>
  );
}
