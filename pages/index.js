// index.js (modern UI + UX: Tailwind + ShadCN + Lucide Icons + Framer Motion)
import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { ArrowUp, ArrowDown, Flame, Lightning, TrendingDown } from 'lucide-react';

export default function Home() {
  const [coins, setCoins] = useState([]);
  const [displayCoins, setDisplayCoins] = useState([]);
  const [followedCoins, setFollowedCoins] = useState([]);
  const [upCount, setUpCount] = useState(0);
  const [downCount, setDownCount] = useState(0);
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
      let up = 0;
      let down = 0;

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

        if (change10s !== null) {
          if (change10s > 0) up++;
          else if (change10s < 0) down++;
        }

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
        if (change10s > 0 && change30s > change10s && change60s > change30s) isMomentumUp = true;

        let isMomentumDown = false;
        if (change10s < 0 && change30s < change10s && change60s < change30s) isMomentumDown = true;

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

      setUpCount(up);
      setDownCount(down);

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
    <div className="bg-zinc-950 text-white min-h-screen p-4">
      <audio ref={audioRef} src="/alert.mp3" />

      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-center mb-4 text-lime-400">
          Binance Futures Realtime Monitor
        </h1>

        <div className="flex justify-center gap-6 mb-6">
          <div className="bg-zinc-800 px-4 py-2 rounded-lg flex items-center gap-2">
            <ArrowUp className="text-green-400" size={20} />
            <span className="text-sm">Yükselen: <strong>{upCount}</strong></span>
          </div>
          <div className="bg-zinc-800 px-4 py-2 rounded-lg flex items-center gap-2">
            <ArrowDown className="text-red-400" size={20} />
            <span className="text-sm">Düşen: <strong>{downCount}</strong></span>
          </div>
        </div>

        <div className="overflow-x-auto bg-zinc-900 rounded-xl">
          <table className="w-full table-auto text-sm">
            <thead>
              <tr className="text-left border-b border-zinc-700">
                <th className="px-3 py-2">Coin</th>
                <th className="px-3">Price</th>
                <th className="px-3">Δ10s</th>
                <th className="px-3">Δ30s</th>
                <th className="px-3">Δ60s</th>
                <th className="px-3">Vol.Δ</th>
                <th className="px-3">Follow</th>
              </tr>
            </thead>
            <tbody>
              {displayCoins.map((coin) => (
                <tr key={coin.symbol} className="border-b border-zinc-800 hover:bg-zinc-800 transition">
                  <td className="px-3 py-2 font-mono">
                    {coin.symbol} {coin.isVolatile && <Flame className="inline text-orange-500" size={16} />} {coin.isMomentumUp && <Lightning className="inline text-green-400" size={16} />} {coin.isMomentumDown && <TrendingDown className="inline text-red-400" size={16} />}
                  </td>
                  <td className="px-3">{coin.currentPrice}</td>
                  <td className="px-3">{coin.change10s}%</td>
                  <td className="px-3">{coin.change30s}%</td>
                  <td className="px-3">{coin.change60s}%</td>
                  <td className="px-3">{coin.volumeChange}%</td>
                  <td className="px-3">
                    <button
                      onClick={() => toggleFollow(coin.symbol)}
                      className="text-xs px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600"
                    >
                      {followedCoins.includes(coin.symbol) ? 'Takip Ediliyor' : 'Takip Et'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {followedCoins.length > 0 && (
          <div className="mt-8 bg-zinc-900 p-4 rounded-xl">
            <h3 className="text-lg mb-2 text-cyan-400">📌 Takip Listesi</h3>
            <ul className="space-y-1 text-sm">
              {followedCoins.map(symbol => (
                <li key={symbol}>
                  <a
                    href={`https://www.binance.com/en/futures/${symbol}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-white hover:underline"
                  >
                    {symbol}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
