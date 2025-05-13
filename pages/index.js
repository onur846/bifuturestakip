// index.js (with ⚡ for positive momentum and 🔻 for negative)
import { useEffect, useState, useRef } from 'react';
import axios from 'axios';

export default function Home() {
  const [coins, setCoins] = useState([]);
  const [displayCoins, setDisplayCoins] = useState([]);
  const [followedCoins, setFollowedCoins] = useState([]);
  const priceRefs = useRef({});
  const base10s = useRef({});
  const track30s = useRef({});
  const track60s = useRef({});
  const volatilityTrack = useRef({});
  const base15mVolume = useRef({});
  const audioRef = useRef(null);

  const fetchCoins = async () => {
    const [info, tickers] = await Promise.all([
      axios.get('https://fapi.binance.com/fapi/v1/exchangeInfo'),
      axios.get('https://fapi.binance.com/fapi/v1/ticker/24hr')
    ]);

    const activeSymbols = info.data.symbols
      .filter(s => s.contractType === 'PERPETUAL' && s.status === 'TRADING' && s.symbol.endsWith('USDT'))
      .map(s => s.symbol);

    const top = tickers.data
      .filter(t => activeSymbols.includes(t.symbol) && t.quoteVolume && !isNaN(parseFloat(t.quoteVolume)))
      .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, 200);

    setCoins(top);
  };

  useEffect(() => { fetchCoins(); }, []);

  useEffect(() => {
    if (!coins.length) return;
    const ws = new WebSocket('wss://fstream.binance.com/stream');
    const streams = coins.map(c => `${c.symbol.toLowerCase()}@markPrice`);
    ws.onopen = () => ws.send(JSON.stringify({ method: 'SUBSCRIBE', params: streams, id: 1 }));
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.data && msg.data.s && msg.data.p) {
        const price = parseFloat(msg.data.p);
        const symbol = msg.data.s;
        priceRefs.current[symbol] = price;

        if (!track30s.current[symbol]) track30s.current[symbol] = [];
        if (!track60s.current[symbol]) track60s.current[symbol] = [];

        track30s.current[symbol].push(price);
        track60s.current[symbol].push(price);

        if (track30s.current[symbol].length > 3) track30s.current[symbol].shift();
        if (track60s.current[symbol].length > 6) track60s.current[symbol].shift();

        if (!volatilityTrack.current[symbol]) volatilityTrack.current[symbol] = [];
        volatilityTrack.current[symbol].push(price);
        if (volatilityTrack.current[symbol].length > 30) volatilityTrack.current[symbol].shift();
      }
    };
    return () => ws.close();
  }, [coins]);

  useEffect(() => {
    const volumeInterval = setInterval(() => {
      coins.forEach(coin => {
        base15mVolume.current[coin.symbol] = parseFloat(coin.quoteVolume);
      });
    }, 900000);
    return () => clearInterval(volumeInterval);
  }, [coins]);

  const toggleFollow = (symbol) => {
    setFollowedCoins(prev => prev.includes(symbol)
      ? prev.filter(s => s !== symbol)
      : [...prev, symbol]);
  };

  useEffect(() => {
    const updateEvery10s = setInterval(() => {
      const result = [];

      coins.forEach(coin => {
        const symbol = coin.symbol;
        const current = priceRefs.current[symbol];
        const base10 = base10s.current[symbol];
        const track30 = track30s.current[symbol];
        const track60 = track60s.current[symbol];
        const currentVolume = parseFloat(coin.quoteVolume);
        const baseVol = base15mVolume.current[symbol];

        let change10s = null, change30s = null, change60s = null, volumeChange = null;

        if (current && base10) change10s = ((current - base10) / base10) * 100;
        if (track30 && track30.length > 0) change30s = ((current - track30[0]) / track30[0]) * 100;
        if (track60 && track60.length > 0) change60s = ((current - track60[0]) / track60[0]) * 100;
        if (baseVol && currentVolume) volumeChange = ((currentVolume - baseVol) / baseVol) * 100;

        let isHotVolume = volumeChange >= 20;

        let isVolatile = false;
        const vPrices = volatilityTrack.current[symbol] || [];
        if (vPrices.length >= 5) {
          const max = Math.max(...vPrices);
          const min = Math.min(...vPrices);
          const avg = vPrices.reduce((a, b) => a + b, 0) / vPrices.length;
          const spike = ((max - min) / avg) * 100;
          if (spike >= 1.5) isVolatile = true;
        }

        let isMomentumUp = false;
        if (change10s > 0 && change30s > change10s && change60s > change30s) {
          isMomentumUp = true;
        }

        let isMomentumDown = false;
        if (change10s < 0 && change30s < change10s && change60s < change30s) {
          isMomentumDown = true;
        }

        if (current && base10) {
          result.push({
            symbol,
            currentPrice: current.toFixed(4),
            change10s: change10s?.toFixed(2),
            change30s: change30s?.toFixed(2),
            change60s: change60s?.toFixed(2),
            volumeChange: volumeChange?.toFixed(2),
            isHotVolume,
            isVolatile,
            isMomentumUp,
            isMomentumDown
          });

          if (Math.abs(change10s) >= 3) audioRef.current?.play();
        }

        if (current) base10s.current[symbol] = current;
      });

      const sorted = result.sort((a, b) => {
        if (b.isHotVolume && !a.isHotVolume) return 1;
        if (a.isHotVolume && !b.isHotVolume) return -1;
        return Math.abs(b.change10s) - Math.abs(a.change10s);
      });

      setDisplayCoins(sorted);
    }, 10000);

    return () => clearInterval(updateEvery10s);
  }, [coins]);

  return (
    <div style={{ display: 'flex', backgroundColor: '#121212', color: '#eee', fontFamily: 'Segoe UI', padding: 20 }}>
      <div style={{ flex: 1 }}>
        <h1 style={{ color: '#00e676', textAlign: 'center' }}>📈 Binance Futures – Realtime Monitor</h1>
        <audio ref={audioRef} src="/alert.mp3" />

        <div style={{ maxWidth: 900, margin: '0 auto', background: '#1e1e1e', padding: 20, borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #444' }}>
                <th align="left">Coin</th>
                <th align="left">Price</th>
                <th align="left">Δ10s</th>
                <th align="left">Δ30s</th>
                <th align="left">Δ60s</th>
                <th align="left">Volume Δ</th>
                <th align="left">Follow</th>
              </tr>
            </thead>
            <tbody>
              {displayCoins.map((coin) => (
                <tr
                  key={coin.symbol}
                  style={{
                    backgroundColor: Math.abs(coin.change10s) >= 3 ? (coin.change10s > 0 ? '#003c1f' : '#3c0000') : 'transparent',
                    color: Math.abs(coin.change10s) >= 3 ? (coin.change10s > 0 ? '#00e676' : '#ff5252') : '#ccc'
                  }}
                >
                  <td>
                    {coin.symbol} {coin.isVolatile ? '🔥' : ''} {coin.isMomentumUp ? '⚡' : ''} {coin.isMomentumDown ? '🔻' : ''}
                  </td>
                  <td>{coin.currentPrice}</td>
                  <td>{coin.change10s}%</td>
                  <td>{coin.change30s || '–'}%</td>
                  <td>{coin.change60s || '–'}%</td>
                  <td>{coin.volumeChange || '–'}%</td>
                  <td>
                    <button onClick={() => toggleFollow(coin.symbol)} style={{ cursor: 'pointer' }}>
                      {followedCoins.includes(coin.symbol) ? '✅' : '📌'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {followedCoins.length > 0 && (
        <div style={{ width: 250, marginLeft: 20, background: '#1e1e1e', padding: 16, borderRadius: 12 }}>
          <h3 style={{ color: '#00bcd4' }}>📌 Takip Listesi</h3>
          <ul>
            {followedCoins.map(symbol => (
              <li key={symbol}>
                <a href={`https://www.binance.com/en/futures/${symbol}`} target="_blank" rel="noreferrer" style={{ color: '#eee' }}>{symbol}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
