// index.js (volume sort + follow list sidebar)
import { useEffect, useState, useRef } from 'react';
import axios from 'axios';

export default function Home() {
  const [coins, setCoins] = useState([]);
  const [displayCoins, setDisplayCoins] = useState([]);
  const [lowPriceHighVolumeCoins, setLowPriceHighVolumeCoins] = useState([]);
  const [followedCoins, setFollowedCoins] = useState([]);
  const priceRefs = useRef({});
  const base10s = useRef({});
  const base10m = useRef({});
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
        priceRefs.current[msg.data.s] = parseFloat(msg.data.p);
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
      const candidates = [];

      coins.forEach(coin => {
        const symbol = coin.symbol;
        const current = priceRefs.current[symbol];
        const base10 = base10s.current[symbol];
        const base10mPrice = base10m.current[symbol];
        const currentVolume = parseFloat(coin.quoteVolume);
        const baseVol = base15mVolume.current[symbol];

        let change10s = null;
        let change10m = null;
        let volumeChange = null;

        if (current && base10) {
          change10s = ((current - base10) / base10) * 100;
        }
        if (current && base10mPrice) {
          change10m = ((current - base10mPrice) / base10mPrice) * 100;
        }
        if (baseVol && currentVolume) {
          volumeChange = ((currentVolume - baseVol) / baseVol) * 100;
        }

        if (current && base10) {
          result.push({
            symbol,
            currentPrice: current.toFixed(4),
            change10s: change10s?.toFixed(2),
            change10m: change10m?.toFixed(2),
            volumeChange: volumeChange?.toFixed(2),
            isHotVolume: volumeChange >= 20
          });

          if (Math.abs(change10s) >= 3) {
            audioRef.current?.play();
          }
        }

        if (
          volumeChange >= 30 &&
          Math.abs(change10m) <= 1.0 &&
          Math.abs(change10s) <= 1.0
        ) {
          candidates.push({ symbol, volumeChange: volumeChange.toFixed(2), change10m: change10m?.toFixed(2) });
        }

        if (current) base10s.current[symbol] = current;
        if (!base10m.current[symbol]) base10m.current[symbol] = current;
      });

      const sorted = result.sort((a, b) => {
        if (b.isHotVolume && !a.isHotVolume) return 1;
        if (a.isHotVolume && !b.isHotVolume) return -1;
        return Math.abs(b.change10s) - Math.abs(a.change10s);
      });

      setDisplayCoins(sorted);
      setLowPriceHighVolumeCoins(candidates);
    }, 10000);

    return () => clearInterval(updateEvery10s);
  }, [coins]);

  return (
    <div style={{ display: 'flex', backgroundColor: '#121212', color: '#eee', fontFamily: 'Segoe UI', padding: 20 }}>
      <div style={{ flex: 1 }}>
        <h1 style={{ color: '#00e676', textAlign: 'center' }}>📈 Binance Futures – Realtime Monitor</h1>
        <audio ref={audioRef} src="/alert.mp3" />

        {lowPriceHighVolumeCoins.length > 0 && (
          <div style={{ maxWidth: 900, margin: '20px auto', background: '#1e1e1e', padding: 20, borderRadius: 12 }}>
            <h2 style={{ color: '#ffa726' }}>🟡 Hacmi Artmış Ama Fiyatı Patlamamış Coinler</h2>
            <ul>
              {lowPriceHighVolumeCoins.map((c) => (
                <li key={c.symbol}>
                  <a href={`https://www.binance.com/en/futures/${c.symbol}`} target="_blank" rel="noreferrer" style={{ color: '#00bcd4' }}>
                    {c.symbol}
                  </a> – Volume +{c.volumeChange}%, Price +{c.change10m}%
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ maxWidth: 900, margin: '0 auto', background: '#1e1e1e', padding: 20, borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #444' }}>
                <th align="left">Coin</th>
                <th align="left">Price</th>
                <th align="left">Change (10s)</th>
                <th align="left">Change (10m)</th>
                <th align="left">Volume Δ (15m)</th>
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
                  <td>{coin.symbol}</td>
                  <td>{coin.currentPrice}</td>
                  <td>{coin.change10s}%</td>
                  <td>{coin.change10m || '–'}%</td>
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
