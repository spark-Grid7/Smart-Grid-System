import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  ZapOff, 
  AlertTriangle, 
  ShieldCheck,
  ArrowDownRight,
  Activity,
  Settings2,
  Leaf
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot,
  doc,
  updateDoc
} from 'firebase/firestore';
import { ref, onValue, set } from 'firebase/database';
import { db, auth, rtdb, handleFirestoreError, OperationType } from '../firebase';

import { useLoadShedding } from '../hooks/useLoadShedding';

export const LoadShedding = () => {
  const { livePower, loadPercentage, ecoMode, devices, lastShedTime } = useLoadShedding();

  // Shedding Logic
  const getSheddingStatus = (priority: number) => {
    if (!ecoMode) return 'active';
    // Priority 1 NEVER shed per user request
    if (loadPercentage >= 85 && priority >= 2) return 'shed';
    if (loadPercentage >= 75 && priority >= 3) return 'shed';
    return 'active';
  };

  const shedDevices = devices.filter(d => getSheddingStatus(d.priority) === 'shed');
  const activeDevices = devices.filter(d => getSheddingStatus(d.priority) === 'active');
  const estimatedSavings = shedDevices.length * 150; // Assuming 150W per device

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Load Shedding Control</h1>
          <p className="text-slate-500 mt-1">Priority-based automated grid management</p>
        </div>
        <div className={`px-6 py-3 rounded-2xl font-bold flex items-center gap-2 ${
          ecoMode ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200' : 'bg-slate-200 text-slate-500'
        }`}>
          {ecoMode ? <ShieldCheck size={20} /> : <ZapOff size={20} />}
          Eco Mode: {ecoMode ? 'ACTIVE' : 'INACTIVE'}
        </div>
      </div>

      {/* Live Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
              <Activity size={24} />
            </div>
            <div>
              <h3 className="text-slate-500 text-sm font-medium">Power Load</h3>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold text-slate-900">{loadPercentage}%</p>
                <p className="text-sm font-bold text-slate-400">({livePower} W)</p>
              </div>
              <p className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${
                loadPercentage > 85 ? 'text-rose-500' : loadPercentage > 75 ? 'text-amber-500' : 'text-emerald-500'
              }`}>
                {loadPercentage > 85 ? 'Critical Demand' : loadPercentage > 75 ? 'High Demand' : 'Normal Load'}
              </p>
            </div>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${loadPercentage}%` }}
              className={`h-full ${loadPercentage > 85 ? 'bg-rose-500' : loadPercentage > 75 ? 'bg-amber-500' : 'bg-emerald-500'}`}
            />
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
              <ZapOff size={24} />
            </div>
            <div>
              <h3 className="text-slate-500 text-sm font-medium">Devices Shed</h3>
              <p className="text-2xl font-bold text-slate-900">{shedDevices.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
              <Leaf size={24} />
            </div>
            <div>
              <h3 className="text-slate-500 text-sm font-medium">Power Saved</h3>
              <p className="text-2xl font-bold text-slate-900">{estimatedSavings} W</p>
            </div>
          </div>
        </div>
      </div>

      {/* Impact Analysis */}
      <div className="bg-emerald-900 text-white p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <ShieldCheck className="text-emerald-400" size={28} />
            <h2 className="text-2xl font-bold">Grid Protection Active</h2>
          </div>
          <p className="text-emerald-100/80 max-w-2xl mb-8">
            The system is currently protecting your critical Level 1 devices by shedding non-essential loads. 
            Low-priority devices are shed at 75% load, and medium-priority devices at 85% load. 
            This prevents a total blackout and extends the life of your home's electrical infrastructure.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
              <span className="text-xs font-bold text-emerald-300 uppercase">Last Action</span>
              <p className="text-lg font-bold">{lastShedTime || 'No actions yet'}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
              <span className="text-xs font-bold text-emerald-300 uppercase">Mode</span>
              <p className="text-lg font-bold">Priority-First</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
              <span className="text-xs font-bold text-emerald-300 uppercase">Status</span>
              <p className="text-lg font-bold">{loadPercentage > 85 ? 'Critical' : 'Stable'}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
              <span className="text-xs font-bold text-emerald-300 uppercase">Tariff Rate</span>
              <p className="text-lg font-bold">₹{(livePower * 0.007 * 24).toFixed(2)}</p>
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-400/10 rounded-full -mr-32 -mt-32 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-400/10 rounded-full -ml-32 -mb-32 blur-3xl" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Active Shedding Logic */}
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Settings2 className="text-emerald-500" size={24} />
            Shedding Rules (Eco Mode)
          </h2>
          <div className="space-y-6">
            <div className={`p-4 rounded-2xl border ${loadPercentage >= 75 && ecoMode ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-700">Level 1: Low Priority</span>
                {loadPercentage >= 75 && ecoMode && <span className="text-xs font-bold text-amber-600 uppercase tracking-widest animate-pulse">Shedding Active</span>}
              </div>
              <p className="text-sm text-slate-500">Automatically turned OFF when load exceeds 75% in Eco Mode.</p>
            </div>

            <div className={`p-4 rounded-2xl border ${loadPercentage >= 85 && ecoMode ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-700">Level 2: Medium Priority</span>
                {loadPercentage >= 85 && ecoMode && <span className="text-xs font-bold text-rose-600 uppercase tracking-widest animate-pulse">Shedding Active</span>}
              </div>
              <p className="text-sm text-slate-500">Automatically turned OFF when load exceeds 85% in Eco Mode.</p>
            </div>

            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-emerald-700">Level 3: Critical Priority</span>
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Protected</span>
              </div>
              <p className="text-sm text-emerald-600/70">Never shed automatically. Reserved for essential medical or security equipment.</p>
            </div>
          </div>
        </div>

        {/* Live Device Status */}
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-6">Live Device Impact</h2>
          <div className="space-y-4">
            {devices.map(device => {
              const status = getSheddingStatus(device.priority);
              return (
                <div key={device.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-xl ${status === 'shed' ? 'bg-rose-100 text-rose-500' : 'bg-emerald-100 text-emerald-500'}`}>
                      {status === 'shed' ? <ZapOff size={20} /> : <Zap size={20} />}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800">{device.name}</h4>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Priority {device.priority}</p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    status === 'shed' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
                  }`}>
                    {status === 'shed' ? 'SHED' : 'ACTIVE'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
