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
  Unlink,
  ArrowUpRight,
  ArrowDownRight,
  Smartphone,
  Activity,
  Link as LinkIcon,
  Cpu
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
import { ref, onValue, set, get } from 'firebase/database';
import { db, auth, rtdb, handleFirestoreError, OperationType } from '../firebase';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { useLoadShedding } from '../hooks/useLoadShedding';
import { DevicePower } from './DevicePower';

export const Dashboard = () => {
  const navigate = useNavigate();
  const { livePower, loadPercentage, ecoMode, devices, hardwareId, isOnline } = useLoadShedding();
  const [gridStatus, setGridStatus] = useState<'stable' | 'critical'>('stable');
  const [voltage, setVoltage] = useState(0);
  const [current, setCurrent] = useState(0);
  const [motorStatus, setMotorStatus] = useState(false);
  const [loading, setLoading] = useState(true);

  const GRID_CAPACITY = 3000; // Max Watts before warning
  const isHighLoad = loadPercentage > 85;

  useEffect(() => {
    if (!auth.currentUser) return;

    // Self-healing: Ensure the branch exists on load
    const initializeIfMissing = async () => {
      const basePath = hardwareId ? `hardware/${hardwareId}/grid` : `users/${auth.currentUser.uid}/grid`;
      const gridRef = ref(rtdb, basePath);
      const snapshot = await get(gridRef);
      if (!snapshot.exists()) {
        await set(gridRef, {
          power: 0,
          voltage: 0,
          current: 0,
          status: 'stable',
          motor_status: false,
          heartbeat: 0
        });
      }
    };
    initializeIfMissing();

    // Listen for Voltage and Current (from hardware or user path)
    const setupListeners = (hId: string | null) => {
      const basePath = hId ? `hardware/${hId}/grid` : `users/${auth.currentUser.uid}/grid`;
      
      const vRef = ref(rtdb, `${basePath}/voltage`);
      const cRef = ref(rtdb, `${basePath}/current`);
      const mRef = ref(rtdb, `${basePath}/motor_status`);
      const sRef = ref(rtdb, `${basePath}/status`);

      const unsubV = onValue(vRef, s => s.exists() && setVoltage(s.val()));
      const unsubC = onValue(cRef, s => s.exists() && setCurrent(s.val()));
      const unsubM = onValue(mRef, s => s.exists() && setMotorStatus(s.val()));
      const unsubS = onValue(sRef, s => s.exists() && setGridStatus(s.val()));

      return () => {
        unsubV();
        unsubC();
        unsubM();
        unsubS();
      };
    };

    let cleanupListeners = setupListeners(hardwareId);

    setLoading(false);

    return () => {
      cleanupListeners();
    };
  }, [hardwareId]);

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
      if (hardwareId && !isOnline) return;
      
      const pin = (relayPin !== undefined && relayPin !== null) ? relayPin : 0;
      
      try {
        const deviceRef = doc(db, 'devices', deviceId);
        const newStatus = !currentStatus;
        
        // Update Firestore
        await updateDoc(deviceRef, { status: newStatus });
        
        // Update Realtime Database
        const basePath = hardwareId ? `hardware/${hardwareId}` : `users/${auth.currentUser.uid}`;
        const rtdbDeviceRef = ref(rtdb, `${basePath}/devices/${pin}`);
        await set(rtdbDeviceRef, newStatus);

        if (name.toLowerCase().includes('motor') || name.toLowerCase().includes('pump')) {
          const motorRef = ref(rtdb, `${basePath}/grid/motor_status`);
          await set(motorRef, newStatus);
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
              "flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all duration-300 shadow-sm",
              ecoMode 
                ? "bg-emerald-500 text-white shadow-lg shadow-emerald-200" 
                : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-100"
            )}
          >
            <Leaf size={20} className={ecoMode ? "animate-pulse" : ""} />
            Eco Mode: {ecoMode ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Top Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
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
          <h3 className="text-slate-500 text-xs font-medium">Grid Status</h3>
          <p className="text-lg font-bold text-slate-900 mt-1">
            {gridStatus === 'stable' ? 'Optimal' : 'Critical'}
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
          <h3 className="text-slate-500 text-xs font-medium">Live Power</h3>
          <p className="text-lg font-bold text-slate-900 mt-1">{livePower} W</p>
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
              {motorStatus ? 'Motor: ON' : 'Motor: OFF'}
            </div>
          </div>
          <h3 className="text-slate-500 text-xs font-medium">Daily Cost</h3>
          <p className="text-lg font-bold text-emerald-600 mt-1">₹{(livePower * 0.007 * 24).toFixed(2)}</p>
        </motion.div>

        {/* Load Shedding */}
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
              <span className="text-xs font-bold text-slate-400 uppercase">Load</span>
              <p className={cn(
                "text-sm font-bold",
                isHighLoad ? "text-rose-600" : "text-emerald-600"
              )}>{loadPercentage}%</p>
            </div>
          </div>
          <h3 className="text-slate-500 text-xs font-medium">Shedding</h3>
          <p className={cn(
            "text-lg font-bold mt-1",
            isHighLoad && ecoMode ? "text-rose-600" : "text-slate-900"
          )}>
            {isHighLoad && ecoMode ? 'Active' : 'Standby'}
          </p>
        </motion.div>

        {/* Hardware Status */}
        <motion.div 
          whileHover={{ y: -5 }}
          onClick={() => navigate('/hardware')}
          className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm cursor-pointer hover:border-emerald-200 transition-all"
        >
          <div className="flex items-center justify-between mb-4">
            <div className={cn(
              "p-3 rounded-2xl",
              hardwareId ? (isOnline ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600") : "bg-slate-50 text-slate-400"
            )}>
              <Cpu size={24} />
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-slate-400 uppercase">Link</span>
              <p className={cn(
                "text-sm font-bold",
                hardwareId ? (isOnline ? "text-emerald-600" : "text-rose-600") : "text-slate-400"
              )}>
                {hardwareId ? (isOnline ? 'Online' : 'Offline') : 'None'}
              </p>
            </div>
          </div>
          <h3 className="text-slate-500 text-xs font-medium">Hardware</h3>
          <p className="text-lg font-bold text-slate-900 mt-1 truncate">
            {hardwareId ? hardwareId : 'Simulated'}
          </p>
        </motion.div>
      </div>

      {/* Grid Warning Banner */}
      {hardwareId && !isOnline && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border border-amber-100 p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500 text-white rounded-2xl">
              <AlertCircle size={24} />
            </div>
            <div>
              <h4 className="font-bold text-amber-900">Hardware Offline</h4>
              <p className="text-sm text-amber-700">Your ESP32 is not communicating. Dashboard values are frozen and remote control is disabled.</p>
            </div>
          </div>
          <button 
            onClick={() => navigate('/hardware')}
            className="px-6 py-2 bg-white border border-amber-200 text-amber-700 font-bold rounded-xl hover:bg-amber-100 transition-all"
          >
            Troubleshoot
          </button>
        </motion.div>
      )}

      {isHighLoad && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-rose-50 border border-rose-100 p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-rose-500 text-white rounded-2xl animate-pulse">
              <AlertCircle size={24} />
            </div>
            <div>
              <h4 className="font-bold text-rose-900">Critical Grid Load ({loadPercentage}%)</h4>
              <p className="text-sm text-rose-700">Demand is exceeding safe limits. {ecoMode ? 'Eco Mode is active and shedding load.' : 'Activate Eco Mode to protect the grid.'}</p>
            </div>
          </div>
          <div className="flex items-center gap-6 w-full md:w-auto">
            <button 
              onClick={() => navigate('/load-shedding')}
              className="text-rose-600 font-bold hover:underline transition-all"
            >
              Manage Grid
            </button>
          </div>
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
                <div className="flex flex-col items-end gap-2">
                  <button
                    onClick={() => toggleDevice(device.id, device.status, device.relayPin, device.name)}
                    disabled={hardwareId ? !isOnline : false}
                    className={cn(
                      "group flex items-center gap-2 focus:outline-none transition-opacity",
                      hardwareId && !isOnline && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <span className={cn(
                      "text-xs font-bold uppercase tracking-wider transition-colors",
                      device.status ? "text-emerald-500" : "text-slate-400"
                    )}>
                      {device.status ? 'Turn Off' : 'Turn On'}
                    </span>
                    <div className={cn(
                      "w-10 h-5 rounded-full relative transition-colors duration-300",
                      device.status ? "bg-emerald-500" : "bg-slate-200"
                    )}>
                      <motion.div
                        animate={{ x: device.status ? 22 : 2 }}
                        className="absolute top-1 w-3 h-3 bg-white rounded-full shadow-sm"
                      />
                    </div>
                  </button>
                </div>
              </div>
              
              <div className="space-y-1">
                <h3 className="font-bold text-slate-800 text-base">{device.name}</h3>
                <div className="flex items-center gap-2 text-slate-500 text-xs">
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
                <div className="flex flex-col gap-1">
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
                    {hardwareId ? (
                      <span className={cn(
                        "text-[10px] font-bold flex items-center gap-0.5",
                        isOnline ? "text-emerald-500" : "text-rose-500"
                      )}>
                        {isOnline ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                        {isOnline ? 'Linked & Online' : 'Linked & Offline'}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-400 flex items-center gap-0.5">
                        <Unlink size={10} /> Simulated
                      </span>
                    )}
                  </div>
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
