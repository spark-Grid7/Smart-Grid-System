import React, { useState, useEffect } from 'react';
import { 
  Settings2, 
  AlertCircle, 
  ArrowUp, 
  ArrowDown, 
  Zap,
  Info
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc 
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';

interface Device {
  id: string;
  name: string;
  type: string;
  relayPin: number;
  priority: number;
  status: boolean;
}

export const Priorities = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'devices'),
      where('userId', '==', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Device));
      // Sort by priority then name
      list.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
      setDevices(list);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'devices'));

    return () => unsubscribe();
  }, []);

  const updatePriority = async (deviceId: string, newPriority: number) => {
    if (newPriority < 1 || newPriority > 3) return;
    try {
      const deviceRef = doc(db, 'devices', deviceId);
      await updateDoc(deviceRef, { priority: newPriority });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `devices/${deviceId}`);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Appliance Priorities</h1>
        <p className="text-slate-500 mt-1">Define which appliances are essential during grid stress</p>
      </div>

      {/* Info Card */}
      <div className="bg-blue-50 border border-blue-100 p-6 rounded-3xl flex gap-6">
        <div className="p-4 bg-blue-500 text-white rounded-2xl shrink-0">
          <Info size={24} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-blue-900">How Priorities Work</h3>
          <p className="text-blue-700 text-sm leading-relaxed mt-1">
            During load shedding or grid stress, the system automatically switches off devices based on their priority level. 
            <span className="font-bold"> Level 1 (High)</span> devices are kept on as long as possible, while 
            <span className="font-bold"> Level 3 (Low)</span> are the first to be switched off.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Priority Columns */}
        {[1, 2, 3].map((level) => (
          <div key={level} className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h3 className={`text-lg font-bold flex items-center gap-2 ${
                level === 1 ? 'text-rose-600' : level === 2 ? 'text-amber-600' : 'text-blue-600'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  level === 1 ? 'bg-rose-500' : level === 2 ? 'bg-amber-500' : 'bg-blue-500'
                }`} />
                {level === 1 ? 'High Priority' : level === 2 ? 'Medium Priority' : 'Low Priority'}
              </h3>
              <span className="text-slate-400 text-sm font-bold">
                {devices.filter(d => d.priority === level).length}
              </span>
            </div>

            <div className="space-y-3 min-h-[200px] p-4 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
              <AnimatePresence mode="popLayout">
                {devices.filter(d => d.priority === level).map((device) => (
                  <motion.div
                    key={device.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-slate-800">{device.name}</h4>
                        <div className="flex items-center gap-2 text-xs text-slate-400 font-bold uppercase mt-1">
                          <Zap size={12} />
                          GPIO {device.relayPin}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => updatePriority(device.id, device.priority - 1)}
                          disabled={device.priority === 1}
                          className="p-1 hover:bg-slate-100 rounded-md text-slate-400 disabled:opacity-20"
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button 
                          onClick={() => updatePriority(device.id, device.priority + 1)}
                          disabled={device.priority === 3}
                          className="p-1 hover:bg-slate-100 rounded-md text-slate-400 disabled:opacity-20"
                        >
                          <ArrowDown size={16} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {devices.filter(d => d.priority === level).length === 0 && !loading && (
                <div className="h-full flex items-center justify-center py-10">
                  <p className="text-slate-300 text-sm font-medium italic">No appliances</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
