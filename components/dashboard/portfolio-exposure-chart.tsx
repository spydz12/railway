'use client'

import { Pie, PieChart, ResponsiveContainer, Cell, Tooltip } from 'recharts'

interface PortfolioExposureChartProps {
  stocks: number
  crypto: number
}

const COLORS = ['#38bdf8', '#f59e0b']

export function PortfolioExposureChart({ stocks, crypto }: PortfolioExposureChartProps) {
  const data = [
    { name: 'Stocks', value: Number(stocks.toFixed(1)) },
    { name: 'Crypto', value: Number(crypto.toFixed(1)) },
  ]

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={62}
            outerRadius={96}
            paddingAngle={2}
            stroke="#0f172a"
          >
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
