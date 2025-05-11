import { useEffect, useState, useRef } from 'react';
import axios from 'axios';

export default function Home() {
  const [coins, setCoins] = useState([]);
  const [displayCoins, setDisplayCoins] = useState([]);
  const priceRefs = useRef({});      // Holds live price
  const basePrices = useRef({});     // Holds price from 10 seconds ago
  const audioRef = useRef(null);
  const wsRef = useRef(null);

  // Fetch top 200 USDT futures coins
  const fetchCoins = async () => {
    const info = await axios.get("https://fapi.binance.com/fapi/v1/exchangeInfo");
    const symbols = info.data.symbols
      .filter((s) => s.contractType === "PERPETUAL" && s.symbol.endsWith("USDT"))
      .map((s) => s.symbol);

    const tickers = await axios.get("https://fapi.binance.com/fapi/v1/ticker/24hr");
    const top = tickers.data
      .filter((t) => symbols.includes(t.symbol))
      .sort((a, b) => parseFloat(b.volume) - parseFloat(a.volume))
      .slice(0, 200);
    
    setCoins(top);
  };

  useEffect(() => {
    fetchCoins();
  }, []);

  useEffect(() => {
    if (coins.length === 0) return;

    const ws = new WebSocket("wss://fstream.binance.com/stream");
    wsRef.current = ws;

    const streams = coins.map((c) => `${c.symbol.toLowerCase()}@markPrice`);
    ws.onopen = () => {
      ws.send(JSON.stringify({
        method: "SUBSCRIBE",
        params: streams,
        id: 1
      }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.data && msg.data.s && msg.data.p) {
        const symbol = msg.data.s;
        const price = parseFloat(msg.data.p);

        priceRefs.current[symbol] = price;
      }
    };

    ws.onclose = () => console.log("WebSocket closed");
    return () => ws.close();
  }, [coins]);

  // Every 10 seconds: snapshot base prices and calculate change
  useEffect(() => {
    const updateEvery10s = setInterval(() => {
      const result = [];

      coins.forEach((coin) => {
        const symbol = coin.symbol;
        const current = priceRefs.current[symbol];
        const base = basePrices.current[symbol];

        if (current && base) {
          const change = ((current - base) / base) * 100;
          const roundedChange = change.toFixed(2);

          result.push({
            symbol,
            currentPrice: current.toFixed(4),
            changePercent: roundedChange
          });

          if (Math.abs(change) >= 3) {
            audioRef.current?.play();
          }
        }

        // Update base price to current for next 10s window
        if (current) {
          basePrices.current[symbol] = current;
        }
      });

      setDisplayCoins(result);
    }, 10000); // 10 seconds

    return () => clearInterval(updateEvery10s);
  }, [coins]);

  return (
    <div style={{ padding: 20, fontFamily: "Arial" }}>
      <h1>📊 Binance Futures – 10s Live Change Tracker (±3%)</h1>
      <audio ref={audioRef} src="/alert.mp3" />
      {displayCoins.length === 0 ? (
        <p>Loading live price data...</p>
      ) : (
        <table style={{ width: "100%", marginTop: 20, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Coin</th>
              <th style={{ textAlign: "left" }}>Price (USDT)</th>
              <th style={{ textAlign: "left" }}>% Change (10s)</th>
            </tr>
          </thead>
          <tbody>
            {displayCoins.map((coin) => (
              <tr key={coin.symbol} style={{ color: Math.abs(coin.changePercent) >= 3 ? (coin.changePercent > 0 ? 'green' : 'red') : 'black' }}>
                <td>{coin.symbol}</td>
                <td>{coin.currentPrice}</td>
                <td>{coin.changePercent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
