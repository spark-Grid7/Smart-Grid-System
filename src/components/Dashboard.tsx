import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Zap, 
  Leaf, 
  TrendingUp, 
  Calendar, 
  Power,
  AlertCircle,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  Smartphone,
  Activity
} from 'lucide-react';
import { motion } from 'motion/react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc,
  getDoc
} from 'firebase/firestore';
import { ref, onValue, set } from 'firebase/database';
import { db, auth, rtdb, handleFirestoreError, OperationType } from '../firebase';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { useLoadShedding } from '../hooks/useLoadShedding';

export const Dashboard = () => {
  const navigate = useNavigate();
  const { livePower, loadPercentage, ecoMode, devices } = useLoadShedding();
  const [gridStatus, setGridStatus] = useState<'stable' | 'critical'>('stable');
  const [voltage, setVoltage] = useState(0);
  const [current, setCurrent] = useState(0);
  const [motorStatus, setMotorStatus] = useState(false);
  const [loading, setLoading] = useState(true);

  const GRID_CAPACITY = 3000; // Max Watts before warning
  const isHighLoad = loadPercentage > 85;

  useEffect(() => {
    if (!auth.currentUser) return;

    // Listen for Voltage and Current
    const voltageRef = ref(rtdb, 'grid/voltage');
    const unsubscribeVoltage = onValue(voltageRef, (snapshot) => {
      if (snapshot.exists()) {
        setVoltage(snapshot.val());
      }
    });

    const currentRef = ref(rtdb, 'grid/current');
    const unsubscribeCurrent = onValue(currentRef, (snapshot) => {
      if (snapshot.exists()) {
        setCurrent(snapshot.val());
      }
    });

    const motorRef = ref(rtdb, 'grid/motor_status');
    const unsubscribeMotor = onValue(motorRef, (snapshot) => {
      if (snapshot.exists()) {
        setMotorStatus(snapshot.val());
      }
    });

    // Listen to Realtime Database for Grid Status
    const statusRef = ref(rtdb, 'grid/status');
    const unsubscribeStatus = onValue(statusRef, (snapshot) => {
      if (snapshot.exists()) {
        setGridStatus(snapshot.val());
      }
    });

    setLoading(false);

    return () => {
      unsubscribeVoltage();
      unsubscribeCurrent();
      unsubscribeMotor();
      unsubscribeStatus();
    };
  }, []);

  const toggleEcoMode = async () => {
    if (!auth.currentUser) return;
    try {
      const userDocRef = doc(db, 'users', auth.currentUser.uid);
      await updateDoc(userDocRef, { ecoMode: !ecoMode });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    }
  };

  const toggleDevice = async (deviceId: string, currentStatus: boolean, relayPin: number, name: string) => {
    // Ensure relayPin is a valid number (0 is valid)
    const pin = (relayPin !== undefined && relayPin !== null) ? relayPin : 0;
    
    try {
      const deviceRef = doc(db, 'devices', deviceId);
      await updateDoc(deviceRef, { status: !currentStatus });
      
      // Sync to Realtime Database for ESP32 to read instantly
      const rtdbDeviceRef = ref(rtdb, `devices/${pin}`);
      await set(rtdbDeviceRef, !currentStatus);

      // If this is a motor/pump, update the global motor status too
      if (name.toLowerCase().includes('motor') || name.toLowerCase().includes('pump')) {
        const motorRef = ref(rtdb, 'grid/motor_status');
        await set(motorRef, !currentStatus);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `devices/${deviceId}`);
    }
  };

  const savings = ecoMode ? 15.4 : 0;

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Energy Dashboard</h1>
          <p className="text-slate-500 mt-1">Real-time grid monitoring and control</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleEcoMode}
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-2xl font-semibold transition-all duration-300 shadow-sm",
              ecoMode 
                ? "bg-emerald-500 text-white shadow-emerald-200" 
                : "bg-white text-slate-600 hover:bg-slate-50"
            )}
          >
            <Leaf size={20} className={ecoMode ? "animate-pulse" : ""} />
            Eco Mode: {ecoMode ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Top Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Grid Status */}
        <motion.div 
          whileHover={{ y: -5 }}
          className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm"
        >
          <div className="flex items-center justify-between mb-4">
            <div className={cn(
              "p-3 rounded-2xl",
              gridStatus === 'stable' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
            )}>
              <Zap size={24} fill="currentColor" />
            </div>
            <span className={cn(
              "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
              gridStatus === 'stable' ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
            )}>
              {gridStatus}
            </span>
          </div>
          <h3 className="text-slate-500 text-sm font-medium">Grid Status</h3>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {gridStatus === 'stable' ? 'Optimal Performance' : 'High Load Warning'}
          </p>
        </motion.div>

        {/* Live Power */}
        <motion.div 
          whileHover={{ y: -5 }}
          className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-2xl bg-blue-50 text-blue-600">
              <TrendingUp size={24} />
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">V: {voltage}V | I: {current}A</p>
            </div>
          </div>
          <h3 className="text-slate-500 text-sm font-medium">Live Power Usage</h3>
          <p className="text-2xl font-bold text-slate-900 mt-1">{livePower} W</p>
        </motion.div>

        {/* Savings */}
        <motion.div 
          whileHover={{ y: -5 }}
          className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-2xl bg-amber-50 text-amber-600">
              <Leaf size={24} />
            </div>
            <div className={cn(
              "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
              motorStatus ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
            )}>
              {motorStatus ? 'Motor: Active' : 'Motor: Idle'}
            </div>
          </div>
          <h3 className="text-slate-500 text-sm font-medium">Current Tariff Rate</h3>
          <p className="text-2xl font-bold text-emerald-600 mt-1">₹{(livePower * 0.007 * 24).toFixed(2)}</p>
          <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Daily estimated cost</p>
        </motion.div>

        {/* Grid Health */}
        <motion.div 
          whileHover={{ y: -5 }}
          onClick={() => navigate('/load-shedding')}
          className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm cursor-pointer hover:border-emerald-200 transition-all"
        >
          <div className="flex items-center justify-between mb-4">
            <div className={cn(
              "p-3 rounded-2xl",
              isHighLoad ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
            )}>
              <Activity size={24} />
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-slate-400 uppercase">Load Level</span>
              <p className={cn(
                "text-sm font-bold",
                isHighLoad ? "text-rose-600" : "text-emerald-600"
              )}>{loadPercentage}%</p>
            </div>
          </div>
          <h3 className="text-slate-500 text-sm font-medium">Load Shedding</h3>
          <p className={cn(
            "text-2xl font-bold mt-1",
            isHighLoad && ecoMode ? "text-rose-600" : "text-slate-900"
          )}>
            {isHighLoad && ecoMode ? 'Active' : 'Standby'}
          </p>
        </motion.div>
      </div>

      {/* Grid Warning Banner */}
      {isHighLoad && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-rose-50 border border-rose-100 p-6 rounded-3xl flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-rose-500 text-white rounded-2xl animate-pulse">
              <AlertCircle size={24} />
            </div>
            <div>
              <h4 className="font-bold text-rose-900">Critical Grid Load ({loadPercentage}%)</h4>
              <p className="text-sm text-rose-700">Demand is exceeding safe limits. High-priority mode activated.</p>
            </div>
          </div>
          <button 
            onClick={() => navigate('/load-shedding')}
            className="px-6 py-2 bg-white text-rose-600 font-bold rounded-xl shadow-sm hover:bg-rose-50 transition-all"
          >
            Manage Grid
          </button>
        </motion.div>
      )}

      {/* Appliances Section */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-800">Connected Appliances</h2>
          <span className="text-slate-500 text-sm font-medium">{devices.length} Devices Active</span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {devices.map((device) => (
            <motion.div
              key={device.id}
              layout
              className={cn(
                "p-6 rounded-3xl border transition-all duration-300",
                device.status 
                  ? "bg-white border-emerald-100 shadow-lg shadow-emerald-50" 
                  : "bg-slate-50 border-slate-100 opacity-80"
              )}
            >
              <div className="flex items-start justify-between mb-6">
                <div className={cn(
                  "p-4 rounded-2xl",
                  device.status ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"
                )}>
                  <Power size={24} />
                </div>
                <button
                  onClick={() => toggleDevice(device.id, device.status, device.relayPin, device.name)}
                  className={cn(
                    "w-14 h-8 rounded-full relative transition-colors duration-300",
                    device.status ? "bg-emerald-500" : "bg-slate-300"
                  )}
                >
                  <motion.div
                    animate={{ x: device.status ? 26 : 4 }}
                    className="absolute top-1 w-6 h-6 bg-white rounded-full shadow-sm"
                  />
                </button>
              </div>
              
              <div className="space-y-1">
                <h3 className="font-bold text-slate-800 text-lg">{device.name}</h3>
                <div className="flex items-center gap-2 text-slate-500 text-sm">
                  <span>{device.type}</span>
                  <span>•</span>
                  <span className={cn(
                    device.relayPin === undefined ? "text-rose-500 font-bold" : ""
                  )}>
                    {device.relayPin !== undefined ? `GPIO ${device.relayPin}` : 'No GPIO Set'}
                  </span>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    device.status ? "bg-emerald-500 animate-pulse" : "bg-slate-300"
                  )} />
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {device.status ? 'Running' : 'Standby'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-slate-400 uppercase">Priority:</span>
                  <span className={cn(
                    "text-xs font-bold px-2 py-0.5 rounded-md",
                    device.priority === 1 ? "bg-rose-100 text-rose-600" : 
                    device.priority === 2 ? "bg-amber-100 text-amber-600" : 
                    "bg-blue-100 text-blue-600"
                  )}>
                    {device.priority === 1 ? 'High' : device.priority === 2 ? 'Medium' : 'Low'}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}

          {devices.length === 0 && !loading && (
            <div className="col-span-full flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
              <div className="p-4 bg-slate-50 rounded-full text-slate-400 mb-4">
                <Smartphone size={40} />
              </div>
              <p className="text-slate-500 font-medium">No devices connected yet</p>
              <button 
                onClick={() => navigate('/devices')}
                className="text-emerald-500 font-bold mt-2 hover:underline"
              >
                Add your first device
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
