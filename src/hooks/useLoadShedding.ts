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
    const unsubscribeUser = onSnapshot(userDocRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setEcoMode(data.ecoMode || false);
        setHardwareId(data.hardwareId || null);
      }
    });

    // Listen to either hardwareId path or default user path
    let unsubscribePower = () => {};
    
    const setupPowerListener = (hId: string | null) => {
      const path = hId ? `hardware/${hId}/grid/power` : `users/${auth.currentUser.uid}/grid/power`;
      const powerRef = ref(rtdb, path);
      return onValue(powerRef, (snapshot) => {
        if (snapshot.exists()) {
          setLivePower(snapshot.val());
        }
      });
    };

    // We need to react to hardwareId changes
    const userDocUnsub = onSnapshot(userDocRef, (doc) => {
      if (doc.exists()) {
        const hId = doc.data().hardwareId || null;
        unsubscribePower();
        unsubscribePower = setupPowerListener(hId);
      }
    });

    return () => {
      unsubscribeDevices();
      unsubscribeUser();
      userDocUnsub();
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
          const pin = (device.relayPin !== undefined && device.relayPin !== null) ? device.relayPin : 0;
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

  return { livePower, loadPercentage, ecoMode, devices, lastShedTime, isShedding };
};
