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
  Cpu,
  Wifi,
  WifiOff
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
  const { livePower, voltage, current, loadPercentage, ecoMode, devices, hardwareId, isOnline, activePins, dbConnected } = useLoadShedding();
  const [gridStatus, setGridStatus] = useState<'stable' | 'critical'>('stable');
  const [loading, setLoading] = useState(true);

  const GRID_CAPACITY = 4000; // Matching ESP32 POWER_LIMIT
  const isHighLoad = loadPercentage > 85;

  useEffect(() => {
    if (!auth.currentUser) return;

    // Self-healing: Ensure the branch exists on load
    const initializeIfMissing = async () => {
      if (!auth.currentUser) return;
      const uid = auth.currentUser.uid;
      const basePath = `${uid}/hardware`;
      
      const hardwareRef = ref(rtdb, basePath);
      
      // Only try to initialize if we are actually connected to the DB
      if (dbConnected) {
        try {
          const snapshot = await get(hardwareRef);
          
          // Prepare appliances data from current Firestore devices
          const appliances: Record<string, any> = {};
          devices.forEach(d => {
            appliances[d.id] = {
              name: d.name,
              pin: d.relayPin,
              priority: d.priority,
              status: d.status,
              command: d.status ? "ON" : "OFF"
            };
          });

          if (!snapshot.exists()) {
            await set(hardwareRef, {
              sensors: {
                realtime: { power: 0, voltage: 230, current: 0 }
              },
              status: {
                isOnline: !hardwareId, // Always online in simulation mode
                isLinked: !!hardwareId,
                lastSeen: Date.now(),
                verified_pins: {}
              },
              settings: {
                ecoMode: ecoMode,
                macAddress: hardwareId || "SIMULATED"
              },
              appliances: appliances,
              schedules: {}
            });
          } else {
            // Even if it exists, ensure appliances are synced if the folder is empty or missing
            const data = snapshot.val();
            if (!data.appliances || Object.keys(data.appliances).length === 0) {
              await set(ref(rtdb, `${basePath}/appliances`), appliances);
            }
          }
        } catch (e) {
          console.error("[SmartGrid] Initialization failed", e);
        }
      }
    };
    initializeIfMissing();

    setLoading(false);
  }, [dbConnected]); // Re-run when connection is established

  const [simPower, setSimPower] = useState(0);
  const [simVoltage, setSimVoltage] = useState(230);

  const updateSimulation = async (power: number, v: number) => {
    if (!auth.currentUser || hardwareId) return;
    const uid = auth.currentUser.uid;
    const basePath = `${uid}/hardware/sensors/realtime`;
    await set(ref(rtdb, basePath), {
      power: power,
      voltage: v,
      current: Number((power / v).toFixed(2))
    });
  };

  const toggleEcoMode = async () => {
    if (!auth.currentUser) return;
    try {
      const uid = auth.currentUser.uid;
      const userDocRef = doc(db, 'users', uid);
      const newEco = !ecoMode;
      await updateDoc(userDocRef, { ecoMode: newEco });
      
      // Sync to RTDB
      const basePath = `${uid}/hardware/settings/ecoMode`;
      await set(ref(rtdb, basePath), newEco);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    }
  };

    const toggleDevice = async (deviceId: string, currentStatus: boolean, relayPin: number, name: string) => {
      if (!auth.currentUser) return;
      
      try {
        const uid = auth.currentUser.uid;
        const deviceRef = doc(db, 'devices', deviceId);
        const newStatus = !currentStatus;
        
        // Update Firestore
        await updateDoc(deviceRef, { status: newStatus });
        
        // Update Realtime Database
        const basePath = `${uid}/hardware/appliances/${deviceId}`;
          
        await set(ref(rtdb, `${basePath}/command`), newStatus ? "ON" : "OFF");
        await set(ref(rtdb, `${basePath}/status`), newStatus);
        await set(ref(rtdb, `${basePath}/pin`), relayPin);

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
          <div className="flex items-center gap-2 mt-1">
            <p className="text-slate-500">Real-time grid monitoring and control</p>
            <div className="h-1 w-1 rounded-full bg-slate-300" />
            <div className={cn(
              "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
              isOnline ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
            )}>
              {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
              {hardwareId ? (isOnline ? 'Hardware Online' : 'Hardware Offline') : 'Simulated Mode'}
            </div>
            <div className={cn(
              "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
              dbConnected ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"
            )}>
              <Activity size={12} className={dbConnected ? "animate-pulse" : ""} />
              {dbConnected ? 'DB Connected' : 'DB Reconnecting...'}
            </div>
          </div>
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
            <div className={cn(
              "p-3 rounded-2xl",
              hardwareId && !isOnline ? "bg-slate-50 text-slate-400" : "bg-blue-50 text-blue-600"
            )}>
              <TrendingUp size={24} className={cn(isOnline && "animate-pulse")} />
            </div>
            <div className="text-right flex flex-col items-end gap-1">
              {isOnline && hardwareId && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-md text-[8px] font-black uppercase tracking-tighter animate-pulse border border-blue-100">
                  <Activity size={8} />
                  Live Data
                </div>
              )}
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {hardwareId && !isOnline ? '---' : `V: ${voltage.toFixed(1)}V | I: ${current.toFixed(2)}A`}
              </p>
            </div>
          </div>
          <h3 className="text-slate-500 text-xs font-medium">Live Power</h3>
          <p className={cn(
            "text-lg font-bold mt-1",
            hardwareId && !isOnline ? "text-slate-300" : "text-slate-900"
          )}>
            {hardwareId && !isOnline ? 'OFFLINE' : `${livePower} W`}
          </p>
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
              ecoMode ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
            )}>
              {ecoMode ? 'Eco: Active' : 'Eco: Off'}
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
          {auth.currentUser && (
            <p className="text-[10px] text-slate-400 mt-1 font-mono break-all">
              RTDB: {`/${auth.currentUser.uid}/hardware`}
            </p>
          )}
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
              <h4 className="font-bold text-amber-900">
                {!dbConnected ? 'Database Reconnecting' : 'Hardware Data Missing'}
              </h4>
              <p className="text-sm text-amber-700">
                {!dbConnected 
                  ? 'The app is trying to reach Firebase. Check your internet connection.' 
                  : 'Connected to Firebase, but no data is arriving from your ESP32. Check your hardware power and WiFi.'}
              </p>
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

      {/* Simulation Controls - Only visible when no hardware is linked */}
      {!hardwareId && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900 p-8 rounded-[2.5rem] border border-slate-800 shadow-2xl"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
              <Activity size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Simulation Controls</h2>
              <p className="text-slate-400 text-sm">Manually adjust grid parameters to test load shedding logic</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Simulated Power Load</label>
                <span className="text-2xl font-mono text-amber-400 font-bold">{simPower} W</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="6000" 
                step="50"
                value={simPower}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setSimPower(val);
                  updateSimulation(val, simVoltage);
                }}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-bold">
                <span>0 W</span>
                <span>3000 W (Warning)</span>
                <span>6000 W (Critical)</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Simulated Voltage</label>
                <span className="text-2xl font-mono text-blue-400 font-bold">{simVoltage} V</span>
              </div>
              <input 
                type="range" 
                min="160" 
                max="260" 
                step="1"
                value={simVoltage}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setSimVoltage(val);
                  updateSimulation(simPower, val);
                }}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-bold">
                <span>160 V</span>
                <span>230 V (Normal)</span>
                <span>260 V</span>
              </div>
            </div>
          </div>

          <div className="mt-8 p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50 flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg">
              <Zap size={16} />
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              <span className="text-blue-400 font-bold">Pro Tip:</span> Slide the power above <span className="text-white font-bold">3000W</span> with <span className="text-emerald-400 font-bold">Eco Mode ON</span> to see the system automatically turn off low-priority devices.
            </p>
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
                    className={cn(
                      "group flex items-center gap-2 focus:outline-none transition-opacity",
                      hardwareId && !isOnline && "opacity-80"
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
                        isOnline 
                          ? (activePins[device.relayPin] ? "text-emerald-500" : "text-amber-500") 
                          : "text-rose-500"
                      )}>
                        {isOnline 
                          ? (activePins[device.relayPin] ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />) 
                          : <Unlink size={10} />}
                        {isOnline 
                          ? (activePins[device.relayPin] ? 'Linked & Online' : 'Pin Not Verified') 
                          : 'Hardware Offline'}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-400 flex items-center gap-0.5">
                        <Activity size={10} /> Simulated Mode
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
