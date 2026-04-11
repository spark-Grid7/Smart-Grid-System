import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  Link as LinkIcon, 
  Unlink, 
  CheckCircle2, 
  AlertCircle, 
  Info,
  Zap,
  Activity,
  ShieldCheck,
  RefreshCw,
  Wifi,
  WifiOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { ref, onValue, set } from 'firebase/database';
import { db, auth, rtdb } from '../firebase';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { useLoadShedding } from '../hooks/useLoadShedding';

export const Hardware = () => {
  const { isOnline, hardwareId: linkedId, detectedMac } = useLoadShedding();
  const [hardwareId, setHardwareId] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [isPhysicallyLinked, setIsPhysicallyLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  const [linkStatus, setLinkStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (!auth.currentUser || !linkedId) {
      setIsPhysicallyLinked(false);
      setLoading(false);
      return;
    }

    const basePath = `users/${auth.currentUser.uid}/hardware/${linkedId}`;
    const linkedRef = ref(rtdb, `${basePath}/status/isLinked`);
    
    const unsub = onValue(linkedRef, (snapshot) => {
      setIsPhysicallyLinked(snapshot.val() || false);
      setLoading(false);
    });

    return () => unsub();
  }, [linkedId]);

  const handleLinkHardware = async () => {
    if (!auth.currentUser || !hardwareId.trim()) return;
    setIsLinking(true);
    setLinkStatus('idle');
    try {
      const uid = auth.currentUser.uid;
      const mac = hardwareId.trim().toUpperCase();
      
      // 1. Update Firestore for the UI
      const userDocRef = doc(db, 'users', uid);
      await updateDoc(userDocRef, { hardwareId: mac });
      
      // 2. Update RTDB for the ESP32 to verify
      const basePath = `users/${uid}/hardware/${mac}`;
      await set(ref(rtdb, `${basePath}/settings/macAddress`), mac);
      await set(ref(rtdb, `${basePath}/status/isLinked`), false); // Reset until ESP32 confirms
      
      setHardwareId('');
      setLinkStatus('success');
      setTimeout(() => setLinkStatus('idle'), 3000);
    } catch (error) {
      console.error("Linking failed", error);
      setLinkStatus('error');
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlink = async () => {
    if (!auth.currentUser) return;
    
    setIsLinking(true);
    try {
      const uid = auth.currentUser.uid;
      const userDocRef = doc(db, 'users', uid);
      await updateDoc(userDocRef, { hardwareId: null });
      
      const basePath = `users/${uid}/hardware/${linkedId}`;
      await set(ref(rtdb, `${basePath}/settings/macAddress`), null);
      await set(ref(rtdb, `${basePath}/status/isLinked`), false);
      setShowUnlinkConfirm(false);
    } catch (error) {
      console.error("Unlinking failed", error);
    } finally {
      setIsLinking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-emerald-500" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-slate-900">Hardware Management</h1>
        <p className="text-slate-500">Connect and manage your physical SmartGrid devices</p>
      </div>

      {!linkedId ? (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden"
        >
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-10 text-white">
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="bg-emerald-500/20 p-6 rounded-3xl text-emerald-400">
                <Cpu size={64} />
              </div>
              <div className="flex-1 text-center md:text-left">
                <h2 className="text-3xl font-bold mb-3">Link New Device</h2>
                <p className="text-slate-400 text-lg">Enter the unique Device ID (MAC Address) found on your ESP32 hardware to start real-time monitoring.</p>
              </div>
            </div>
          </div>

          <div className="p-10 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <label className="block text-sm font-bold text-slate-700 ml-1">Device ID / MAC Address</label>
                <div className="relative">
                  <Cpu className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input 
                    type="text" 
                    value={hardwareId}
                    onChange={(e) => setHardwareId(e.target.value)}
                    placeholder="e.g. A1B2C3D4E5F6"
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all font-mono text-lg"
                  />
                </div>
                <p className="text-xs text-slate-400 flex items-center gap-1 ml-1">
                  <Info size={14} />
                  Found on the sticker or Serial Monitor of your device
                </p>
              </div>

              <div className="flex flex-col justify-end gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Your User UID</label>
                  <div className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-emerald-400 font-mono text-sm break-all">
                    {auth.currentUser?.uid}
                  </div>
                </div>
                <button 
                  onClick={handleLinkHardware}
                  disabled={isLinking || !hardwareId}
                  className={cn(
                    "w-full py-4 rounded-2xl font-bold text-lg shadow-xl transition-all flex items-center justify-center gap-2",
                    linkStatus === 'success' ? "bg-emerald-600 text-white" : 
                    linkStatus === 'error' ? "bg-rose-500 text-white" :
                    "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-200"
                  )}
                >
                  {isLinking ? 'Linking...' : 
                   linkStatus === 'success' ? 'Linked Successfully!' :
                   linkStatus === 'error' ? 'Failed to Link' :
                   'Link Device'}
                  {linkStatus === 'success' ? <CheckCircle2 size={20} /> : <LinkIcon size={20} />}
                </button>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 p-6 rounded-3xl flex gap-4">
              <div className="text-blue-500 mt-1">
                <ShieldCheck size={24} />
              </div>
              <div>
                <h4 className="font-bold text-blue-900">Secure Connection</h4>
                <p className="text-sm text-blue-700 leading-relaxed">Each device uses a unique identifier. Once linked, only you can see the data from this specific hardware node.</p>
              </div>
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 p-10"
        >
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-6">
              <div className="bg-emerald-500 p-5 rounded-3xl text-white shadow-lg shadow-emerald-200">
                {isPhysicallyLinked ? <CheckCircle2 size={32} /> : <AlertCircle size={32} className="text-white" />}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">
                  {isPhysicallyLinked ? 'Hardware Verified' : 'Registration Pending'}
                </h2>
                <p className="text-slate-500">
                  {isPhysicallyLinked 
                    ? 'Your ESP32 has confirmed the link and is communicating.' 
                    : 'The dashboard is waiting for your ESP32 to connect and verify its MAC address.'}
                </p>
                <div className="mt-2 flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Your User UID (Paste in Arduino Code)</label>
                    <div className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700 font-mono font-bold text-sm w-fit shadow-sm">
                      {auth.currentUser?.uid}
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-lg text-slate-600 font-mono font-bold text-sm w-fit">
                    Linked ID: {linkedId}
                  </div>
                  {detectedMac && detectedMac !== linkedId && (
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-100 rounded-lg text-amber-700 font-mono font-bold text-sm w-fit">
                      Detected Hardware: {detectedMac}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400 font-mono mt-1">
                    Realtime Database Path: <span className="text-emerald-600">/users/{auth.currentUser?.uid}/hardware/{linkedId}</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
              <div className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2",
                isOnline ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
              )}>
                {isOnline ? <Wifi size={14} className="animate-pulse" /> : <WifiOff size={14} />}
                {isOnline ? 'WIFI CONNECTED' : 'WIFI DISCONNECTED'}
              </div>
              <button 
                onClick={() => setShowUnlinkConfirm(true)}
                disabled={isLinking}
                className="px-8 py-4 bg-rose-50 text-rose-600 font-bold rounded-2xl hover:bg-rose-100 transition-all flex items-center justify-center gap-2"
              >
                <Unlink size={20} />
                Unlink Device
              </button>
            </div>
          </div>

          <AnimatePresence>
            {showUnlinkConfirm && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-6 p-6 bg-rose-50 border border-rose-100 rounded-3xl"
              >
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="text-rose-500" size={24} />
                    <div>
                      <h4 className="font-bold text-rose-900">Are you sure?</h4>
                      <p className="text-sm text-rose-700">Unlinking will stop real-time monitoring from this device.</p>
                    </div>
                  </div>
                  <div className="flex gap-3 w-full md:w-auto">
                    <button 
                      onClick={() => setShowUnlinkConfirm(false)}
                      className="flex-1 md:flex-none px-6 py-2 bg-white border border-rose-200 text-rose-700 font-bold rounded-xl hover:bg-rose-100 transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleUnlink}
                      className="flex-1 md:flex-none px-6 py-2 bg-rose-500 text-white font-bold rounded-xl hover:bg-rose-600 transition-all"
                    >
                      Confirm Unlink
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
              <div className="flex items-center gap-3 text-slate-900 font-bold mb-2">
                <Zap size={20} className={isOnline ? "text-amber-500" : "text-slate-300"} />
                {isOnline ? 'Live Connection' : 'No Connection'}
              </div>
              <p className="text-sm text-slate-500">
                {isOnline 
                  ? 'Your ESP32 is communicating with the cloud every 2 seconds.' 
                  : 'Check if your ESP32 is powered on and connected to WiFi.'}
              </p>
            </div>
            <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
              <div className="flex items-center gap-3 text-slate-900 font-bold mb-2">
                <Activity size={20} className="text-blue-500" />
                Data Accuracy
              </div>
              <p className="text-sm text-slate-500">RMS calculations are performed on-device for maximum precision.</p>
            </div>
          </div>
        </motion.div>
      )}

      <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100">
        <h3 className="text-lg font-bold text-slate-800 mb-4">Troubleshooting</h3>
        <ul className="space-y-3 text-slate-600 text-sm">
          <li className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
            If data isn't appearing, ensure your ESP32 is connected to WiFi.
          </li>
          <li className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
            Check that the Device ID matches exactly (case-insensitive).
          </li>
          <li className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
            Verify your Firebase API Key and Database URL in the Arduino code.
          </li>
        </ul>
      </div>

      <motion.div 
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 p-10"
      >
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-blue-500 text-white rounded-xl">
            <Info size={24} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Professional Installation Guide</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-4">
            <div className="aspect-video bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 border border-dashed border-slate-300">
              <Activity size={48} />
            </div>
            <h4 className="font-bold text-slate-800">1. Total Load Monitoring</h4>
            <p className="text-sm text-slate-500 leading-relaxed">
              Clamp a <b>CT Sensor (SCT-013)</b> around the main <b>Live Wire</b> coming from your meter. This measures the total current of the entire house without cutting any wires.
            </p>
          </div>

          <div className="space-y-4">
            <div className="aspect-video bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 border border-dashed border-slate-300">
              <Zap size={48} />
            </div>
            <h4 className="font-bold text-slate-800">2. Dynamic Voltage Sensing</h4>
            <p className="text-sm text-slate-500 leading-relaxed">
              Use a <b>ZMPT101B Voltage Module</b> powered by a <b>5V supply</b>. This sensor provides real-time line voltage data to the ESP32, allowing for accurate power calculations (V × I) even during voltage fluctuations.
            </p>
          </div>

          <div className="space-y-4">
            <div className="aspect-video bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 border border-dashed border-slate-300">
              <ShieldCheck size={48} />
            </div>
            <h4 className="font-bold text-slate-800">3. Circuit Interception</h4>
            <p className="text-sm text-slate-500 leading-relaxed">
              Every appliance has a dedicated wire starting at the <b>Breaker Box</b>. By placing your <b>Relay Board</b> here, you can intercept these wires at the source to turn off entire rooms or heavy appliances without touching the wall sockets.
            </p>
          </div>
        </div>

        <div className="mt-10 p-6 bg-amber-50 border border-amber-100 rounded-3xl">
          <div className="flex gap-4">
            <AlertCircle className="text-amber-500 shrink-0" size={24} />
            <p className="text-sm text-amber-800">
              <b>Safety Warning:</b> Working with high-voltage AC is dangerous. Always turn off the main breaker before installation and consult a certified electrician for wiring into the Distribution Board.
            </p>
          </div>
        </div>

        <div className="mt-12 border-t border-slate-100 pt-12">
          <h3 className="text-xl font-bold text-slate-900 mb-6">Load Shedding Strategy</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-rose-50 rounded-3xl border border-rose-100">
              <div className="w-10 h-10 bg-rose-500 text-white rounded-xl flex items-center justify-center font-bold mb-4 shadow-lg shadow-rose-200">1</div>
              <h4 className="font-bold text-rose-900 mb-2">High Priority</h4>
              <p className="text-xs text-rose-700 leading-relaxed">
                Connect your <b>Fridge, WiFi, and Main Lights</b> to these circuits. The system will never automatically shed these.
              </p>
            </div>

            <div className="p-6 bg-amber-50 rounded-3xl border border-amber-100">
              <div className="w-10 h-10 bg-amber-500 text-white rounded-xl flex items-center justify-center font-bold mb-4 shadow-lg shadow-amber-200">2</div>
              <h4 className="font-bold text-amber-900 mb-2">Medium Priority</h4>
              <p className="text-xs text-amber-700 leading-relaxed">
                Connect <b>Air Conditioners and Heavy Appliances</b>. These will be shed if the total grid load exceeds <b>85%</b>.
              </p>
            </div>

            <div className="p-6 bg-blue-50 rounded-3xl border border-blue-100">
              <div className="w-10 h-10 bg-blue-500 text-white rounded-xl flex items-center justify-center font-bold mb-4 shadow-lg shadow-blue-200">3</div>
              <h4 className="font-bold text-blue-900 mb-2">Low Priority</h4>
              <p className="text-xs text-blue-700 leading-relaxed">
                Connect <b>Water Heaters, Pumps, and Decorative Lights</b>. These are the first to be shed when load exceeds <b>75%</b>.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
