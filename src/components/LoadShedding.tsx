import React from 'react';
import { 
  PowerOff, 
  Clock, 
  AlertTriangle, 
  Info,
  ChevronRight,
  Zap
} from 'lucide-react';
import { motion } from 'motion/react';

export const LoadShedding = () => {
  const schedule = [
    { time: '06:00 - 08:00', area: 'Zone A', status: 'Completed' },
    { time: '10:00 - 12:00', area: 'Zone B', status: 'Active' },
    { time: '14:00 - 16:00', area: 'Zone C', status: 'Upcoming' },
    { time: '18:00 - 20:00', area: 'Zone D', status: 'Upcoming' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Load Shedding</h1>
        <p className="text-slate-500 mt-1">Monitor grid load management and schedules</p>
      </div>

      {/* Status Banner */}
      <div className="bg-amber-50 border border-amber-100 p-6 rounded-3xl flex flex-col md:flex-row items-center gap-6">
        <div className="p-4 bg-amber-500 text-white rounded-2xl shadow-lg shadow-amber-200">
          <AlertTriangle size={32} />
        </div>
        <div className="flex-1 text-center md:text-left">
          <h3 className="text-xl font-bold text-amber-900">Grid Load Warning</h3>
          <p className="text-amber-700">Current grid load is at 92%. Load shedding may be initiated in Zone B shortly.</p>
        </div>
        <button className="px-6 py-3 bg-white text-amber-600 font-bold rounded-xl shadow-sm hover:bg-amber-100 transition-all">
          View Details
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Schedule List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-800">Today's Schedule</h2>
            <div className="flex items-center gap-2 text-slate-500 font-medium">
              <Clock size={18} />
              <span>March 30, 2026</span>
            </div>
          </div>

          <div className="space-y-4">
            {schedule.map((item, index) => (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                key={index}
                className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between group hover:border-emerald-200 transition-all"
              >
                <div className="flex items-center gap-6">
                  <div className={`p-3 rounded-2xl ${
                    item.status === 'Active' ? 'bg-rose-50 text-rose-600 animate-pulse' :
                    item.status === 'Completed' ? 'bg-emerald-50 text-emerald-600' :
                    'bg-slate-50 text-slate-400'
                  }`}>
                    <PowerOff size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-lg">{item.time}</h4>
                    <p className="text-slate-500 font-medium">{item.area}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                    item.status === 'Active' ? 'bg-rose-100 text-rose-700' :
                    item.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {item.status}
                  </span>
                  <ChevronRight size={20} className="text-slate-300 group-hover:text-emerald-500 transition-colors" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Info Sidebar */}
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <Info size={20} />
              </div>
              <h3 className="font-bold text-slate-800">Process Info</h3>
            </div>
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center shrink-0 font-bold text-slate-500">1</div>
                <p className="text-sm text-slate-600 leading-relaxed">Grid monitors load levels across all sectors in real-time.</p>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center shrink-0 font-bold text-slate-500">2</div>
                <p className="text-sm text-slate-600 leading-relaxed">When load exceeds 90%, non-essential sectors are notified.</p>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center shrink-0 font-bold text-slate-500">3</div>
                <p className="text-sm text-slate-600 leading-relaxed">Eco Mode users are automatically optimized to prevent shedding.</p>
              </div>
            </div>
          </div>

          <div className="bg-emerald-500 p-8 rounded-3xl text-white shadow-lg shadow-emerald-100">
            <Zap size={32} className="mb-4" fill="currentColor" />
            <h3 className="text-xl font-bold mb-2">Help the Grid</h3>
            <p className="text-emerald-50 text-sm leading-relaxed mb-6">
              Enabling Eco Mode during peak hours helps prevent load shedding in your area.
            </p>
            <button className="w-full py-3 bg-white text-emerald-600 font-bold rounded-xl hover:bg-emerald-50 transition-all">
              Enable Eco Mode
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
