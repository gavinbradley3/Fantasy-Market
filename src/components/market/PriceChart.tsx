import { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fmtDateShort } from '@/lib/format';
import type { MarketCatalyst, PlayerMarketHistoryPoint } from '@/types/market';

// Full detail chart (§21.5). Route-split (lazy) so Recharts stays off the
// critical path. Honest axes: auto-fit with padding, never trick-scaled.
export function PriceChart({
  history,
  catalysts,
  addedMarker,
}: {
  history: PlayerMarketHistoryPoint[];
  catalysts: MarketCatalyst[];
  addedMarker?: { date: string; price: number };
}) {
  const data = useMemo(
    () =>
      history.map((h) => ({
        date: h.date,
        price: h.marketPrice,
        model: h.fundamentalValue,
      })),
    [history],
  );

  const prices = data.map((d) => d.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const pad = Math.max(1, (max - min) * 0.15);
  const domain: [number, number] = [Math.max(0, Math.floor(min - pad)), Math.min(100, Math.ceil(max + pad))];

  const dateSet = new Map(data.map((d, i) => [d.date, i]));
  const catalystDots = catalysts
    .filter((c) => dateSet.has(c.date))
    .map((c) => ({ ...c, price: data[dateSet.get(c.date)!].price }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2DD4A7" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#2DD4A7" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#232D42" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDateShort}
            tick={{ fill: '#5C6880', fontSize: 11 }}
            minTickGap={40}
            axisLine={{ stroke: '#232D42' }}
            tickLine={false}
          />
          <YAxis
            domain={domain}
            tick={{ fill: '#5C6880', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <RTooltip
            contentStyle={{
              background: '#1A2333',
              border: '1px solid #232D42',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: '#95A1B8' }}
            labelFormatter={(l) => fmtDateShort(String(l))}
            formatter={(v: number, name) => [v.toFixed(1), name === 'price' ? 'Market' : 'Model']}
          />
          <Area type="monotone" dataKey="price" stroke="none" fill="url(#priceFill)" />
          <Line type="monotone" dataKey="model" stroke="#7C8CF8" strokeWidth={1} strokeDasharray="3 3" dot={false} />
          <Line type="monotone" dataKey="price" stroke="#2DD4A7" strokeWidth={2} dot={false} />
          {catalystDots.map((c) => (
            <ReferenceDot
              key={c.id}
              x={c.date}
              y={c.price}
              r={4}
              fill={c.direction === 'bullish' ? '#2DD4A7' : '#F0526A'}
              stroke="#0A0E1A"
              strokeWidth={1}
            />
          ))}
          {addedMarker && dateSet.has(addedMarker.date) && (
            <ReferenceDot x={addedMarker.date} y={addedMarker.price} r={5} fill="#F5B34D" stroke="#0A0E1A" strokeWidth={1} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
