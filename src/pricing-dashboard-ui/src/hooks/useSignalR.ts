import { useEffect, useRef, useCallback, useState } from 'react';
import * as signalR from '@microsoft/signalr';
import type { CurrencyInfo, PriceUpdate, StreamRequest } from '../types';
import { usePricingStore } from '../stores/pricingStore';

const HUB_URL = '/hubs/pricing';

export function useSignalR() {
  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const streamSubscriptionRef = useRef<signalR.ISubscription<PriceUpdate> | null>(null);
  const [connectionState, setConnectionState] = useState<signalR.HubConnectionState>(
    signalR.HubConnectionState.Disconnected
  );

  const {
    setCurrencies,
    setInstrumentTypes,
    updatePrices,
    setStreaming,
    selectedCurrency,
    instruments,
  } = usePricingStore();

  // Initialize connection
  useEffect(() => {
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(HUB_URL)
      .withAutomaticReconnect([0, 1000, 2000, 5000, 10000])
      .configureLogging(signalR.LogLevel.Information)
      .build();

    connection.onreconnecting(() => {
      setConnectionState(signalR.HubConnectionState.Reconnecting);
      console.log('SignalR reconnecting...');
    });

    connection.onreconnected(() => {
      setConnectionState(signalR.HubConnectionState.Connected);
      console.log('SignalR reconnected');
    });

    connection.onclose(() => {
      setConnectionState(signalR.HubConnectionState.Disconnected);
      setStreaming(false);
      console.log('SignalR connection closed');
    });

    connectionRef.current = connection;

    // Start connection
    connection
      .start()
      .then(() => {
        setConnectionState(signalR.HubConnectionState.Connected);
        console.log('SignalR connected');
        return loadCurrencies();
      })
      .catch((err) => {
        console.error('SignalR connection error:', err);
      });

    return () => {
      connection.stop();
    };
  }, []);

  const loadCurrencies = useCallback(async () => {
    const connection = connectionRef.current;
    if (!connection || connection.state !== signalR.HubConnectionState.Connected) {
      return;
    }

    try {
      const currencies = await connection.invoke<string[]>('GetCurrencies');
      setCurrencies(currencies);
    } catch (err) {
      console.error('Failed to load currencies:', err);
    }
  }, [setCurrencies]);

  const loadCurrencyInfo = useCallback(async (currency: string) => {
    const connection = connectionRef.current;
    if (!connection || connection.state !== signalR.HubConnectionState.Connected) {
      return;
    }

    try {
      const info = await connection.invoke<CurrencyInfo>('GetCurrencyInfo', currency);
      if (info) {
        setInstrumentTypes(info.instrumentTypes);
      }
    } catch (err) {
      console.error('Failed to load currency info:', err);
    }
  }, [setInstrumentTypes]);

  const startStream = useCallback(async () => {
    const connection = connectionRef.current;
    if (!connection || connection.state !== signalR.HubConnectionState.Connected) {
      console.error('Cannot start stream: not connected');
      return;
    }

    if (!selectedCurrency || instruments.length === 0) {
      console.error('Cannot start stream: no currency or instruments');
      return;
    }

    // Stop existing stream if any
    if (streamSubscriptionRef.current) {
      streamSubscriptionRef.current.dispose();
      streamSubscriptionRef.current = null;
    }

    const request: StreamRequest = {
      currency: selectedCurrency,
      instruments: instruments,
    };

    try {
      setStreaming(true);
      const stream = connection.stream<PriceUpdate>('StreamPrices', request);

      streamSubscriptionRef.current = stream.subscribe({
        next: (update) => {
          updatePrices(update.prices, update.sequenceNumber);
        },
        error: (err) => {
          console.error('Stream error:', err);
          setStreaming(false);
        },
        complete: () => {
          console.log('Stream completed');
          setStreaming(false);
        },
      });
    } catch (err) {
      console.error('Failed to start stream:', err);
      setStreaming(false);
    }
  }, [selectedCurrency, instruments, updatePrices, setStreaming]);

  const stopStream = useCallback(async () => {
    const connection = connectionRef.current;

    if (streamSubscriptionRef.current) {
      streamSubscriptionRef.current.dispose();
      streamSubscriptionRef.current = null;
    }

    if (connection && connection.state === signalR.HubConnectionState.Connected) {
      try {
        await connection.invoke('StopStream');
      } catch (err) {
        console.error('Failed to stop stream:', err);
      }
    }

    setStreaming(false);
  }, [setStreaming]);

  return {
    connectionState,
    loadCurrencies,
    loadCurrencyInfo,
    startStream,
    stopStream,
  };
}
