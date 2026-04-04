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
  RefreshCw
} from 'lucide-react';
import { motion } from 'motion/react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const Hardware = () => {
  const [hardwareId, setHardwareId] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [linkedId, setLinkedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;

    const userDocRef = doc(db, 'users', auth.currentUser.uid);
    const unsubscribe = onSnapshot(userDocRef, (doc) => {
      if (doc.exists()) {
        setLinkedId(doc.data().hardwareId || null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLinkHardware = async () => {
    if (!auth.currentUser || !hardwareId.trim()) return;
    setIsLinking(true);
    try {
      const userDocRef = doc(db, 'users', auth.currentUser.uid);
      await updateDoc(userDocRef, { hardwareId: hardwareId.trim().toUpperCase() });
      setHardwareId('');
    } catch (error) {
      console.error("Linking failed", error);
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlink = async () => {
    if (!auth.currentUser) return;
    if (!window.confirm("Are you sure you want to unlink this device? Your dashboard will stop showing real-time data from your home.")) return;
    
    setIsLinking(true);
    try {
      const userDocRef = doc(db, 'users', auth.currentUser.uid);
      await updateDoc(userDocRef, { hardwareId: null });
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

              <div className="flex flex-col justify-end">
                <button 
                  onClick={handleLinkHardware}
                  disabled={isLinking || !hardwareId}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white py-4 rounded-2xl font-bold text-lg shadow-xl shadow-emerald-200 transition-all flex items-center justify-center gap-2"
                >
                  {isLinking ? 'Linking...' : 'Link Device'}
                  <LinkIcon size={20} />
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
                <CheckCircle2 size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Device Linked Successfully</h2>
                <p className="text-slate-500">Your dashboard is currently receiving real-time data.</p>
                <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-lg text-slate-600 font-mono font-bold text-sm">
                  ID: {linkedId}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
              <button 
                onClick={handleUnlink}
                disabled={isLinking}
                className="px-8 py-4 bg-rose-50 text-rose-600 font-bold rounded-2xl hover:bg-rose-100 transition-all flex items-center justify-center gap-2"
              >
                <Unlink size={20} />
                Unlink Device
              </button>
            </div>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
              <div className="flex items-center gap-3 text-slate-900 font-bold mb-2">
                <Zap size={20} className="text-amber-500" />
                Live Connection
              </div>
              <p className="text-sm text-slate-500">Your ESP32 is communicating with the cloud every 2 seconds.</p>
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
    </div>
  );
};
