import { useEffect, useState } from 'react';

export default function Home() {
  const [coins, setCoins] = useState([]);
  const [ws, setWs] = useState(null);

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
      }
    };

    webSocket.onclose = () => {
      console.log('WebSocket connection closed');
    };

    setWs(webSocket);

    return () => {
      webSocket.close();
    };
  }, []);

  return (
    <div>
      <h1>Cryptocurrency Tracker (Binance Futures)</h1>
      {coins.length > 0 ? (
        <ul>
          {coins.map(coin => (
            <li key={coin.s}>
              {coin.s}: {parseFloat(coin.p).toFixed(2)}% change
            </li>
          ))}
        </ul>
      ) : (
        <p>No coins with significant changes.</p>
      )}
    </div>
  );
}
