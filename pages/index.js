// pages/index.js
import { useEffect, useState } from 'react';

export default function Home() {
  const [coins, setCoins] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null); // Track last update time

  useEffect(() => {
    const webSocket = new WebSocket('wss://fstream.binance.com/ws');

    webSocket.onopen = () => {
      console.log('WebSocket connection established');
      webSocket.send(JSON.stringify({ method: 'SUBSCRIBE', params: ['!ticker@arr'], id: 1 }));
    };

    webSocket.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (Array.isArray(msg)) {
        const updatedCoins = msg.filter(coin => {
          const priceChangePercent = parseFloat(coin.p);
          return Math.abs(priceChangePercent) >= 3;
        });
        setCoins(updatedCoins);
        setLastUpdated(Date.now()); // Update last updated time
      }
    };

    webSocket.onclose = () => {
      console.log('WebSocket connection closed');
    };

    return () => {
      webSocket.close();
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      // This will run every 10 seconds and can be used to log updates
      console.log('Checking for updates...');
      setLastUpdated(Date.now());
    }, 10000); // 10 seconds

    return () => clearInterval(interval); // Clean up interval on unmount
  }, []);

  return (
    <div>
      <h1>Cryptocurrency Tracker (Binance Futures)</h1>
      <p>Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : 'Loading...'}</p>
      {coins.length > 0 ? (
        <ul>
          {coins.map(coin => (
            <li key={coin.s}>
              {coin.s}: {coin.p} ({coin.P}% change)
            </li>
          ))}
        </ul>
      ) : (
        <p>No coins with significant changes.</p>
      )}
    </div>
  );
}
