import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Clock, 
  Calendar,
  Zap,
  CheckCircle2,
  AlertCircle,
  Power,
  Timer,
  Smartphone,
  ChevronRight,
  MoreVertical,
  ToggleLeft,
  ToggleRight,
  Leaf
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
  updateDoc
} from 'firebase/firestore';
import { ref, set, remove } from 'firebase/database';
import { db, auth, rtdb, handleFirestoreError, OperationType } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import { useLoadShedding } from '../hooks/useLoadShedding';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Schedule {
  id: string;
  deviceId: string;
  deviceName: string;
  action: 'ON' | 'OFF';
  time: string; // HH:mm
  days: string[];
  enabled: boolean;
}

export const Schedules = () => {
  const { devices, hardwareId } = useLoadShedding();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [newSchedule, setNewSchedule] = useState({
    deviceId: '',
    action: 'ON' as 'ON' | 'OFF',
    time: '08:00',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    enabled: true
  });

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'schedules'),
      where('userId', '==', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const scheduleData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Schedule[];
      setSchedules(scheduleData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'schedules');
    });

    return () => unsubscribe();
  }, []);

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !newSchedule.deviceId) return;

    const device = devices.find(d => d.id === newSchedule.deviceId);
    if (!device) return;

    try {
      const docRef = await addDoc(collection(db, 'schedules'), {
        ...newSchedule,
        deviceName: device.name,
        userId: auth.currentUser.uid,
        createdAt: serverTimestamp()
      });

      // Sync to RTDB for hardware
      const uid = auth.currentUser.uid;
      const basePath = hardwareId 
        ? `users/${uid}/hardware/${hardwareId}/schedules/${docRef.id}`
        : `users/${uid}/hardware/schedules/${docRef.id}`;
      await set(ref(rtdb, basePath), {
        ...newSchedule,
        deviceName: device.name
      });

      setShowAddModal(false);
      setNewSchedule({
        deviceId: '',
        action: 'ON',
        time: '08:00',
        days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        enabled: true
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'schedules');
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!auth.currentUser) return;
    try {
      const uid = auth.currentUser.uid;
      const basePath = hardwareId 
        ? `users/${uid}/hardware/${hardwareId}/schedules/${id}`
        : `users/${uid}/hardware/schedules/${id}`;
      await remove(ref(rtdb, basePath));
      
      await deleteDoc(doc(db, 'schedules', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `schedules/${id}`);
    }
  };

  const toggleScheduleStatus = async (schedule: Schedule) => {
    if (!auth.currentUser) return;
    try {
      const scheduleRef = doc(db, 'schedules', schedule.id);
      await updateDoc(scheduleRef, { enabled: !schedule.enabled });
      
      const uid = auth.currentUser.uid;
      const basePath = hardwareId 
        ? `users/${uid}/hardware/${hardwareId}/schedules/${schedule.id}/enabled`
        : `users/${uid}/hardware/schedules/${schedule.id}/enabled`;
      await set(ref(rtdb, basePath), !schedule.enabled);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `schedules/${schedule.id}`);
    }
  };

  const toggleDay = (day: string) => {
    setNewSchedule(prev => ({
      ...prev,
      days: prev.days.includes(day) 
        ? prev.days.filter(d => d !== day)
        : [...prev.days, day]
    }));
  };

  const allDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Smart Schedules</h1>
          <p className="text-slate-500 mt-1">Automate your appliances with precision timers</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-2xl font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-600 transition-all active:scale-95"
        >
          <Plus size={20} />
          Add Schedule
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence>
          {schedules.map((schedule) => (
            <motion.div
              key={schedule.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={cn(
                "bg-white p-6 rounded-3xl border transition-all duration-300 relative group",
                schedule.enabled ? "border-slate-100 shadow-sm" : "border-slate-50 opacity-60 grayscale-[0.5]"
              )}
            >
              <div className="flex items-start justify-between mb-6">
                <div className={cn(
                  "p-4 rounded-2xl transition-colors duration-300",
                  schedule.action === 'ON' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                )}>
                  <Clock size={24} />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleScheduleStatus(schedule)}
                    className={cn(
                      "p-1 rounded-lg transition-all",
                      schedule.enabled ? "text-emerald-500" : "text-slate-300"
                    )}
                  >
                    {schedule.enabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                  </button>
                  <button 
                    onClick={() => handleDeleteSchedule(schedule.id)}
                    className="p-2 text-slate-200 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <h3 className="font-bold text-slate-800 text-lg">{schedule.deviceName}</h3>
                <div className="flex items-center gap-2 text-slate-500 text-sm">
                  <span className={cn(
                    "font-bold uppercase tracking-wider",
                    schedule.action === 'ON' ? "text-emerald-600" : "text-rose-600"
                  )}>
                    TURN {schedule.action}
                  </span>
                  <span>at</span>
                  <span className="font-bold text-slate-700 text-base">{schedule.time}</span>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-1.5">
                {allDays.map(day => (
                  <span 
                    key={day}
                    className={cn(
                      "text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all",
                      schedule.days.includes(day) 
                        ? "bg-emerald-100 text-emerald-700 shadow-sm" 
                        : "bg-slate-50 text-slate-300"
                    )}
                  >
                    {day[0]}
                  </span>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Timer size={14} className="text-slate-400" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {schedule.enabled ? 'Active' : 'Paused'}
                  </span>
                </div>
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  schedule.enabled ? "bg-emerald-500 animate-pulse" : "bg-slate-300"
                )} />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {schedules.length === 0 && !loading && (
          <div className="col-span-full flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
            <div className="p-4 bg-slate-50 rounded-full text-slate-400 mb-4">
              <Calendar size={40} />
            </div>
            <p className="text-slate-500 font-medium">No schedules set yet</p>
            <button 
              onClick={() => setShowAddModal(true)}
              className="text-emerald-500 font-bold mt-2 hover:underline"
            >
              Create your first automation
            </button>
          </div>
        )}
      </div>

      {/* Add Schedule Modal */}
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
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Add Schedule</h2>
              <form onSubmit={handleAddSchedule} className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Select Device</label>
                  <select 
                    required
                    value={newSchedule.deviceId}
                    onChange={e => setNewSchedule({...newSchedule, deviceId: e.target.value})}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="">Choose a device...</option>
                    {devices.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Action</label>
                    <div className="flex gap-2">
                      {(['ON', 'OFF'] as const).map(action => (
                        <button
                          key={action}
                          type="button"
                          onClick={() => setNewSchedule({...newSchedule, action})}
                          className={cn(
                            "flex-1 py-3 rounded-xl font-bold transition-all",
                            newSchedule.action === action 
                              ? action === 'ON' ? "bg-emerald-500 text-white shadow-lg shadow-emerald-100" : "bg-rose-500 text-white shadow-lg shadow-rose-100"
                              : "bg-slate-50 text-slate-500"
                          )}
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Time</label>
                    <input 
                      required
                      type="time" 
                      value={newSchedule.time}
                      onChange={e => setNewSchedule({...newSchedule, time: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold text-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Repeat Days</label>
                  <div className="flex flex-wrap gap-2">
                    {allDays.map(day => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={cn(
                          "px-3 py-2 rounded-lg text-xs font-bold transition-all border",
                          newSchedule.days.includes(day)
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm"
                            : "bg-slate-50 text-slate-400 border-slate-100"
                        )}
                      >
                        {day}
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
                    className="flex-1 py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100 active:scale-95"
                  >
                    Save Schedule
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
