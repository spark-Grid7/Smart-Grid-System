import React, { useState, useEffect } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { Download, FileSpreadsheet, FileText, Calendar } from 'lucide-react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

interface EnergyData {
  timestamp: string;
  consumption: number;
  day: string;
}

export const Analytics = () => {
  const [data, setData] = useState<EnergyData[]>([]);
  const [timeRange, setTimeRange] = useState<'week' | 'month'>('week');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!auth.currentUser) return;
      
      try {
        const q = query(
          collection(db, 'energyUsage'),
          where('userId', '==', auth.currentUser.uid),
          orderBy('timestamp', 'desc')
        );
        
        const snapshot = await getDocs(q);
        const usageData = snapshot.docs.map(doc => {
          const d = doc.data();
          const date = new Date(d.timestamp);
          return {
            timestamp: d.timestamp,
            consumption: d.consumption,
            day: date.toLocaleDateString('en-US', { weekday: 'short' }),
            fullDate: date.toLocaleDateString()
          };
        });

        // Mock data if empty for demo
        if (usageData.length === 0) {
          const mockData = [
            { day: 'Mon', consumption: 450, fullDate: '2026-03-24' },
            { day: 'Tue', consumption: 520, fullDate: '2026-03-25' },
            { day: 'Wed', consumption: 380, fullDate: '2026-03-26' },
            { day: 'Thu', consumption: 610, fullDate: '2026-03-27' },
            { day: 'Fri', consumption: 490, fullDate: '2026-03-28' },
            { day: 'Sat', consumption: 720, fullDate: '2026-03-29' },
            { day: 'Sun', consumption: 650, fullDate: '2026-03-30' },
          ];
          setData(mockData as any);
        } else {
          setData(usageData as any);
        }
        setLoading(false);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'energyUsage');
      }
    };

    fetchData();
  }, [timeRange]);

  const exportToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Energy Usage");
    XLSX.writeFile(workbook, "SmartGrid_Energy_Report.xlsx");
  };

  const exportToPDF = () => {
    const doc = new jsPDF() as any;
    doc.text("SmartGrid Energy Consumption Report", 14, 15);
    doc.autoTable({
      startY: 20,
      head: [['Date', 'Day', 'Consumption (W)']],
      body: data.map(item => [(item as any).fullDate, item.day, item.consumption]),
    });
    doc.save("SmartGrid_Energy_Report.pdf");
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Energy Analytics</h1>
          <p className="text-slate-500 mt-1">Analyze your consumption patterns and trends</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 font-semibold hover:bg-slate-50 transition-all"
          >
            <FileSpreadsheet size={18} className="text-emerald-500" />
            Excel
          </button>
          <button
            onClick={exportToPDF}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 font-semibold hover:bg-slate-50 transition-all"
          >
            <FileText size={18} className="text-rose-500" />
            PDF
          </button>
        </div>
      </div>

      {/* Chart Card */}
      <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-bold text-slate-800">Power Consumption (W)</h3>
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button 
                onClick={() => setTimeRange('week')}
                className={`px-4 py-1 rounded-md text-sm font-bold transition-all ${timeRange === 'week' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}
              >
                Week
              </button>
              <button 
                onClick={() => setTimeRange('month')}
                className={`px-4 py-1 rounded-md text-sm font-bold transition-all ${timeRange === 'month' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}
              >
                Month
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Calendar size={16} />
            <span>Mar 24 - Mar 30, 2026</span>
          </div>
        </div>

        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="day" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }}
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }}
              />
              <Tooltip 
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{ 
                  borderRadius: '16px', 
                  border: 'none', 
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                  padding: '12px'
                }}
              />
              <Bar dataKey="consumption" radius={[6, 6, 0, 0]} barSize={40}>
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.consumption > 600 ? '#10b981' : '#34d399'} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Insights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100">
          <h4 className="text-emerald-800 font-bold mb-2">Peak Usage</h4>
          <p className="text-3xl font-bold text-emerald-900">720 W</p>
          <p className="text-emerald-600 text-sm mt-2">Occurred on Saturday</p>
        </div>
        <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100">
          <h4 className="text-blue-800 font-bold mb-2">Average Daily</h4>
          <p className="text-3xl font-bold text-blue-900">545 W</p>
          <p className="text-blue-600 text-sm mt-2">12% lower than last week</p>
        </div>
        <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100">
          <h4 className="text-amber-800 font-bold mb-2">Estimated Bill</h4>
          <p className="text-3xl font-bold text-amber-900">₹3,250</p>
          <p className="text-amber-600 text-sm mt-2">Projected for March</p>
        </div>
      </div>
    </div>
  );
};
