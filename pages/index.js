// pages/index.js
import { useEffect, useState } from 'react';
import axios from 'axios';

const getTopFuturesCoins = async () => {
  try {
    const response = await axios.get("https://fapi.binance.com/fapi/v1/ticker/24hr");
    const coins = response.data;

    // Sort by volume and take the top 200
    const topCoins = coins.sort((a, b) => parseFloat(b.volume) - parseFloat(a.volume)).slice(0, 200);
    
    return topCoins;
  } catch (error) {
    console.error('Error fetching top futures coins:', error);
    return [];
  }
};

export default function Home() {
  const [coins, setCoins] = useState([]);
  const [ws, setWs] = useState(null);

  useEffect(() => {
    const fetchTopFuturesCoins = async () => {
      const topCoins = await getTopFuturesCoins();
      setCoins(topCoins);
    };

    fetchTopFuturesCoins();

    const webSocket = new WebSocket('wss://fstream.binance.com/ws');

    webSocket.onopen = () => {
      console.log('WebSocket connection established');
      // Subscribe to the ticker updates for the coins we're displaying
      const coinSymbols = coins.map(coin => `${coin.symbol.toLowerCase()}@ticker`);
      webSocket.send(JSON.stringify({ method: 'SUBSCRIBE', params: [...coinSymbols], id: 1 }));
    };

    webSocket.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.e === 'ticker') {
        // Update specific coin data if available
        setCoins(coins => {
          return coins.map(coin => {
            if (coin.symbol === msg.s) {
              return {
                ...coin,
                lastPrice: msg.c,
                priceChange: msg.p,
                priceChangePercent: msg.P
              };
            }
            return coin;
          });
        });
      }
    };

    webSocket.onclose = () => {
      console.log('WebSocket connection closed');
    };

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
            <li key={coin.symbol}>
              {coin.symbol}: {coin.lastPrice ? parseFloat(coin.lastPrice).toFixed(2) : 'Loading...'} 
              ({coin.priceChangePercent ? parseFloat(coin.priceChangePercent).toFixed(2) : 'Loading...'}% change)
            </li>
          ))}
        </ul>
      ) : (
        <p>Loading top futures coins...</p>
      )}
    </div>
  );
}
