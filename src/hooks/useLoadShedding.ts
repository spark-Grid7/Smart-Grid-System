import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot,
  doc,
  updateDoc
} from 'firebase/firestore';
import { ref, onValue, set } from 'firebase/database';
import { db, auth, rtdb } from '../firebase';

interface Device {
  id: string;
  name: string;
  type: string;
  priority: number;
  status: boolean;
  relayPin: number;
}

export const useLoadShedding = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [ecoMode, setEcoMode] = useState(false);
  const [hardwareId, setHardwareId] = useState<string | null>(null);
  const [livePower, setLivePower] = useState(0);
  const [lastShedTime, setLastShedTime] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const GRID_CAPACITY = 3000;
  const rawLoadPercentage = (livePower / GRID_CAPACITY) * 100;
  const loadPercentage = Math.min(100, Math.round(rawLoadPercentage));

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'devices'),
      where('userId', '==', auth.currentUser.uid)
    );

    const unsubscribeDevices = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => {
        const data = doc.data();
        return { 
          id: doc.id, 
          ...data,
          priority: Number(data.priority) // Ensure priority is a number
        } as Device;
      });
      setDevices(list);
    });

    const userDocRef = doc(db, 'users', auth.currentUser.uid);
    let unsubscribePower = () => {};
    
    const setupPowerListener = (hId: string | null) => {
      const basePath = hId ? `hardware/${hId}/grid` : `users/${auth.currentUser.uid}/grid`;
      const gridRef = ref(rtdb, basePath);
      
      let lastHeartbeatVal = 0;

      // Watchdog to check if data is stale
      const watchdog = setInterval(() => {
        if (lastHeartbeatVal > 0) {
          const now = Date.now();
          if (Math.abs(now - lastHeartbeatVal) > 30000) {
            setIsOnline(false);
          }
        }
      }, 5000);
      
      const unsub = onValue(gridRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const v = data.voltage || 0;
          const i = data.current || 0;
          const p = data.power !== undefined ? data.power : (v * i);
          setLivePower(Math.round(p));
          
          // Check heartbeat (server timestamp)
          if (data.heartbeat) {
            lastHeartbeatVal = data.heartbeat;
            const now = Date.now();
            const isRecent = Math.abs(now - data.heartbeat) < 30000;
            setIsOnline(isRecent);
          } else {
            setIsOnline(true);
          }
        } else {
          setIsOnline(false);
          setLivePower(0);
        }
      });

      return () => {
        unsub();
        clearInterval(watchdog);
      };
    };

    const unsubscribeUser = onSnapshot(userDocRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setEcoMode(data.ecoMode || false);
        const hId = data.hardwareId || null;
        setHardwareId(hId);
        
        // Update power listener when hardwareId changes
        unsubscribePower();
        unsubscribePower = setupPowerListener(hId);
      }
    });

    return () => {
      unsubscribeDevices();
      unsubscribeUser();
      unsubscribePower();
    };
  }, []);

  useEffect(() => {
    if (!ecoMode || devices.length === 0) return;

    const enforceShedding = async () => {
      const updates: Promise<any>[] = [];
      let changed = false;
      
      for (const device of devices) {
        // Priority 3 = Low, Priority 2 = Medium, Priority 1 = High
        let shouldBeOff = false;
        
        if (rawLoadPercentage > 85) {
          // Shed Low (3) and Medium (2)
          if (device.priority >= 2) shouldBeOff = true;
        } else if (rawLoadPercentage > 75) {
          // Shed Low (3) only
          if (device.priority >= 3) shouldBeOff = true;
        }

        if (shouldBeOff && device.status) {
          // Skip shedding if the device has no relay pin set
          if (device.relayPin === undefined || device.relayPin === null) continue;
          
          const pin = device.relayPin;
          const deviceRef = doc(db, 'devices', device.id);
          
          const basePath = hardwareId ? `hardware/${hardwareId}` : `users/${auth.currentUser.uid}`;
          const rtdbRef = ref(rtdb, `${basePath}/devices/${pin}`);
          
          updates.push(updateDoc(deviceRef, { status: false }));
          updates.push(set(rtdbRef, false));

          // If this is a motor/pump, update the global motor status too
          if (device.name.toLowerCase().includes('motor') || device.name.toLowerCase().includes('pump')) {
            const motorRef = ref(rtdb, `${basePath}/grid/motor_status`);
            updates.push(set(motorRef, false));
          }

          changed = true;
        }
      }

      if (updates.length > 0) {
        try {
          await Promise.all(updates);
          if (changed) setLastShedTime(new Date().toLocaleTimeString());
        } catch (e) {
          console.error("Rapid shedding failed", e);
        }
      }
    };

    enforceShedding();
  }, [rawLoadPercentage, ecoMode, devices]);

  const isShedding = ecoMode && (
    (rawLoadPercentage > 85 && devices.some(d => d.priority >= 2 && !d.status)) ||
    (rawLoadPercentage > 75 && devices.some(d => d.priority >= 3 && !d.status))
  );

  return { livePower, loadPercentage, ecoMode, devices, lastShedTime, isShedding, hardwareId, isOnline };
};
