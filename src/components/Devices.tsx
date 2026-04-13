import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Smartphone, 
  Zap, 
  Search,
  Filter,
  MoreVertical,
  CheckCircle2,
  Unlink,
  AlertCircle,
  Activity
} from 'lucide-react';
import { 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  where,
  serverTimestamp,
  getDoc
} from 'firebase/firestore';
import { ref, set, remove, onValue } from 'firebase/database';
import { db, auth, rtdb, handleFirestoreError, OperationType } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import { DevicePower } from './DevicePower';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Device {
  id: string;
  name: string;
  type: string;
  relayPin: number;
  priority: number;
  status: boolean;
}

import { useLoadShedding } from '../hooks/useLoadShedding';

export const Devices = () => {
  const { devices, hardwareId, isOnline, activePins } = useLoadShedding();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newDevice, setNewDevice] = useState({
    name: '',
    type: 'Other',
    relayPin: 0,
    priority: 2
  });

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    try {
      const docRef = await addDoc(collection(db, 'devices'), {
        ...newDevice,
        userId: auth.currentUser.uid,
        status: false,
        createdAt: serverTimestamp()
      });

      // Sync to Realtime Database for ESP32
      const uid = auth.currentUser.uid.trim();
      const basePath = `users/${uid}/hardware/appliances/${docRef.id}`;
      await set(ref(rtdb, basePath), {
        name: newDevice.name,
        pin: newDevice.relayPin,
        priority: newDevice.priority,
        status: false,
        enabled: true,
        command: "NONE"
      });

      setShowAddModal(false);
      setNewDevice({ name: '', type: 'Other', relayPin: 0, priority: 2 });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'devices');
    }
  };

  const handleDeleteDevice = async (id: string) => {
    if (!auth.currentUser) return;
    try {
      const uid = auth.currentUser.uid.trim();
      const basePath = `users/${uid}/hardware/appliances/${id}`;
      await set(ref(rtdb, basePath), null);

      await deleteDoc(doc(db, 'devices', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `devices/${id}`);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Devices</h1>
          <p className="text-slate-500 mt-1">Manage your connected smart appliances</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-2xl font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-600 transition-all"
        >
          <Plus size={20} />
          Add Device
        </button>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Search devices..." 
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
          />
        </div>
        {!hardwareId && (
          <div className="flex items-center gap-2 px-4 py-2 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-sm font-bold">
            <AlertCircle size={18} />
            No hardware linked. Devices are in simulation mode.
          </div>
        )}
        <button className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-2xl text-slate-600 font-semibold hover:bg-slate-50 transition-all">
          <Filter size={20} />
          Filter
        </button>
      </div>

      {/* Device List */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-sm font-bold text-slate-500 uppercase tracking-wider">Device</th>
                <th className="px-6 py-4 text-sm font-bold text-slate-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 text-sm font-bold text-slate-500 uppercase tracking-wider">Relay Pin</th>
                <th className="px-6 py-4 text-sm font-bold text-slate-500 uppercase tracking-wider">Link Status</th>
                <th className="px-6 py-4 text-sm font-bold text-slate-500 uppercase tracking-wider">Priority</th>
                <th className="px-6 py-4 text-sm font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-sm font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              <AnimatePresence>
                {devices.map((device) => (
                  <motion.tr 
                    key={device.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                          <Smartphone size={20} />
                        </div>
                        <span className="font-bold text-slate-800">{device.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-medium">{device.type}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 text-slate-600 font-bold">
                        GPIO {device.relayPin}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {hardwareId ? (
                          <div className={cn(
                            "flex items-center gap-1.5 font-bold text-sm",
                            isOnline ? (activePins[device.relayPin] ? "text-emerald-500" : "text-amber-500") : "text-rose-500"
                          )}>
                            {isOnline ? (activePins[device.relayPin] ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />) : <Unlink size={16} />}
                            {isOnline ? (activePins[device.relayPin] ? 'Linked & Online' : 'Pin Not Verified') : 'Hardware Offline'}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-slate-400 font-bold text-sm">
                            <Activity size={16} />
                            Simulated Mode
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                        device.priority === 1 ? 'bg-rose-100 text-rose-600' :
                        device.priority === 2 ? 'bg-amber-100 text-amber-600' :
                        'bg-blue-100 text-blue-600'
                      }`}>
                        {device.priority === 1 ? 'High' : device.priority === 2 ? 'Medium' : 'Low'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${device.status ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        <span className="text-sm font-bold text-slate-600">
                          {device.status ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleDeleteDevice(device.id)}
                        className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
                      >
                        <Trash2 size={20} />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
        {devices.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-slate-400 font-medium">No devices found</p>
          </div>
        )}
      </div>

      {/* Add Device Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl p-8"
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Add New Device</h2>
              <form onSubmit={handleAddDevice} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Device Name</label>
                  <input 
                    required
                    type="text" 
                    value={newDevice.name}
                    onChange={e => setNewDevice({...newDevice, name: e.target.value})}
                    placeholder="e.g. Master Bedroom AC"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Type</label>
                    <select 
                      value={newDevice.type}
                      onChange={e => setNewDevice({...newDevice, type: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    >
                      <option>AC</option>
                      <option>Heater</option>
                      <option>Pump</option>
                      <option>Light</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Relay Pin (GPIO)</label>
                    <input 
                      required
                      type="number" 
                      min="0"
                      max="40"
                      value={newDevice.relayPin === 0 && newDevice.name === '' ? '' : newDevice.relayPin}
                      onChange={e => {
                        const val = parseInt(e.target.value);
                        setNewDevice({...newDevice, relayPin: isNaN(val) ? 0 : val});
                      }}
                      placeholder="e.g. 13"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Must match the physical pin on your ESP32.</p>
                  </div>
                </div>
                {hardwareId ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-2 text-emerald-700 text-xs font-bold">
                    <CheckCircle2 size={16} />
                    Device will be linked to Hardware ID: {hardwareId}
                  </div>
                ) : (
                  <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-2 text-rose-700 text-xs font-bold">
                    <AlertCircle size={16} />
                    No hardware linked. This device will be in simulation mode.
                  </div>
                )}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Priority Level</label>
                  <div className="flex gap-2">
                    {[1, 2, 3].map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setNewDevice({...newDevice, priority: p})}
                        className={`flex-1 py-3 rounded-xl font-bold transition-all ${
                          newDevice.priority === p 
                            ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-100' 
                            : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        {p === 1 ? 'High' : p === 2 ? 'Med' : 'Low'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 mt-8">
                  <button 
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100"
                  >
                    Save Device
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
