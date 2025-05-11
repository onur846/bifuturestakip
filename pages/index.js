import { useEffect, useState, useRef } from 'react';
import axios from 'axios';

export default function Home() {
  const [coins, setCoins] = useState([]);
  const [displayCoins, setDisplayCoins] = useState([]);
  const priceRefs = useRef({});
  const basePrices = useRef({});
  const audioRef = useRef(null);
  const wsRef = useRef(null);

  const fetchCoins = async () => {
    try {
      const [exchangeInfoRes, tickersRes] = await Promise.all([
        axios.get('https://fapi.binance.com/fapi/v1/exchangeInfo'),
        axios.get('https://fapi.binance.com/fapi/v1/ticker/24hr'),
      ]);

      const activeSymbols = exchangeInfoRes.data.symbols
        .filter(
          (s) =>
            s.contractType === 'PERPETUAL' &&
            s.symbol.endsWith('USDT') &&
            s.status === 'TRADING'
        )
        .map((s) => s.symbol);

      const tickers = tickersRes.data
        .filter(
          (t) =>
            activeSymbols.includes(t.symbol) &&
            t.quoteVolume &&
            !isNaN(parseFloat(t.quoteVolume))
        )
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, 200);

      setCoins(tickers);
    } catch (error) {
      console.error('Error fetching coin data:', error);
    }
  };

  useEffect(() => {
    fetchCoins();
  }, []);

  useEffect(() => {
    if (coins.length === 0) return;

    const ws = new WebSocket('wss://fstream.binance.com/stream');
    wsRef.current = ws;

    const streams = coins.map((c) => `${c.symbol.toLowerCase()}@markPrice`);
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          method: 'SUBSCRIBE',
          params: streams,
          id: 1,
        })
      );
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.data && msg.data.s && msg.data.p) {
        const symbol = msg.data.s;
        const price = parseFloat(msg.data.p);
        priceRefs.current[symbol] = price;
      }
    };

    ws.onclose = () => console.log('WebSocket closed');
    return () => ws.close();
  }, [coins]);

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
            changePercent: roundedChange,
            quoteVolume: parseFloat(coin.quoteVolume) || 0,
          });

          if (Math.abs(change) >= 3) {
            audioRef.current?.play();
          }
        }

        if (current) {
          basePrices.current[symbol] = current;
        }
      });

      // ✅ Sort by biggest 10-second % change (absolute), highest at top
      const sorted = result.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
      setDisplayCoins(sorted);
    }, 10000);

    return () => clearInterval(updateEvery10s);
  }, [coins]);

  return (
    <div style={{
      backgroundColor: '#121212',
      minHeight: '100vh',
      padding: '40px 20px',
      color: '#eee',
      fontFamily: 'Segoe UI, sans-serif',
    }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{
          fontSize: 28,
          marginBottom: 30,
          textAlign: 'center',
          color: '#00e676'
        }}>
          📊 Binance Futures – Biggest 10s Movers First (±3% Alert)
        </h1>

        <audio ref={audioRef} src="/alert.mp3" />

        {displayCoins.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#aaa' }}>
            Loading live price data...
          </p>
        ) : (
          <div style={{
            background: '#1e1e1e',
            borderRadius: 12,
            padding: 20,
            boxShadow: '0 0 10px rgba(0,0,0,0.6)'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #444' }}>
                  <th style={{ textAlign: 'left', paddingBottom: 10 }}>Coin</th>
                  <th style={{ textAlign: 'left', paddingBottom: 10 }}>Price (USDT)</th>
                  <th style={{ textAlign: 'left', paddingBottom: 10 }}>% Change (10s)</th>
                </tr>
              </thead>
              <tbody>
                {displayCoins.map((coin) => (
                  <tr
                    key={coin.symbol}
                    style={{
                      backgroundColor: Math.abs(coin.changePercent) >= 3
                        ? (coin.changePercent > 0 ? '#003c1f' : '#3c0000')
                        : 'transparent',
                      color: Math.abs(coin.changePercent) >= 3
                        ? (coin.changePercent > 0 ? '#00e676' : '#ff5252')
                        : '#ccc',
                      transition: 'background 0.3s',
                      cursor: 'default'
                    }}
                  >
                    <td style={{ padding: '10px 0' }}>{coin.symbol}</td>
                    <td style={{ padding: '10px 0' }}>{coin.currentPrice}</td>
                    <td style={{ padding: '10px 0' }}>{coin.changePercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
