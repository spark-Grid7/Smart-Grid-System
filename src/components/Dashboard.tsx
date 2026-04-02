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
  Smartphone
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
import { ref, onValue } from 'firebase/database';
import { db, auth, rtdb, handleFirestoreError, OperationType } from '../firebase';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Device {
  id: string;
  name: string;
  type: string;
  wattage: number;
  status: boolean;
  priority: number;
}

export const Dashboard = () => {
  // 1. Create a place to store the sensor readings
  const [readings, setReadings] = useState({ current: 0, voltage: 220, power: 0 });

  // 2. Start "listening" to your Firebase Realtime Database
  useEffect(() => {
    // This connects to the 'grid' folder we saw in your Firebase photo
    const gridRef = ref(rtdb, 'grid'); 
    
    const unsubscribe = onValue(gridRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setReadings({
          current: data.current || 0,
          voltage: data.voltage || 220,
          power: (data.current || 0) * (data.voltage || 220)
        });
      }
    });

    return () => unsubscribe(); // This cleans up the connection
  }, []);
  const navigate = useNavigate();
  const [devices, setDevices] = useState<Device[]>([]);
  const [ecoMode, setEcoMode] = useState(false);
  const [gridStatus, setGridStatus] = useState<'stable' | 'critical'>('stable');
  const [livePower, setLivePower] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;

    const devicesQuery = query(
      collection(db, 'devices'),
      where('userId', '==', auth.currentUser.uid)
    );

    const unsubscribeDevices = onSnapshot(devicesQuery, (snapshot) => {
      const devList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Device));
      setDevices(devList);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'devices'));

    const userDocRef = doc(db, 'users', auth.currentUser.uid);
    const unsubscribeUser = onSnapshot(userDocRef, (doc) => {
      if (doc.exists()) {
        setEcoMode(doc.data().ecoMode || false);
      }
    });

    // Mock grid status updates
    const gridInterval = setInterval(() => {
      setLivePower(prev => {
        const base = 1200;
        const variation = Math.random() * 200 - 100;
        return Math.max(0, Math.round(base + variation));
      });
    }, 3000);

    return () => {
      unsubscribeDevices();
      unsubscribeUser();
      clearInterval(gridInterval);
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

  const toggleDevice = async (deviceId: string, currentStatus: boolean) => {
    try {
      const deviceRef = doc(db, 'devices', deviceId);
      await updateDoc(deviceRef, { status: !currentStatus });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `devices/${deviceId}`);
    }
  };

  const totalConsumption = devices.reduce((acc, dev) => acc + (dev.status ? dev.wattage : 0), 0);
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
            <div className="flex items-center text-emerald-600 text-sm font-bold">
              <ArrowUpRight size={16} />
              <span>2.4%</span>
            </div>
          </div>
          <h3 className="text-slate-500 text-sm font-medium">Live Power Usage</h3>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totalConsumption} W</p>
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
            <div className="flex items-center text-emerald-600 text-sm font-bold">
              <ArrowDownRight size={16} />
              <span>{savings}%</span>
            </div>
          </div>
          <h3 className="text-slate-500 text-sm font-medium">Eco Savings</h3>
          <p className="text-2xl font-bold text-slate-900 mt-1">₹{(totalConsumption * 0.007 * 24).toFixed(2)}/day</p>
        </motion.div>

        {/* Next Task */}
        <motion.div 
          whileHover={{ y: -5 }}
          className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-2xl bg-purple-50 text-purple-600">
              <Calendar size={24} />
            </div>
          </div>
          <h3 className="text-slate-500 text-sm font-medium">Next Scheduled Task</h3>
          <p className="text-2xl font-bold text-slate-900 mt-1">Pump OFF at 22:00</p>
        </motion.div>
      </div>

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
                  onClick={() => toggleDevice(device.id, device.status)}
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
                  <span>{device.wattage}W</span>
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
