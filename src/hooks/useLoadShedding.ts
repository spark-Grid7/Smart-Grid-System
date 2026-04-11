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
  const [activePins, setActivePins] = useState<Record<string, boolean>>({});
  const GRID_CAPACITY = 4000;
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
    
    const setupPowerListener = () => {
      const basePath = `users/${auth.currentUser.uid}/hardware`;
      const sensorsRef = ref(rtdb, `${basePath}/sensors/realtime`);
      const statusRef = ref(rtdb, `${basePath}/status`);
      const settingsRef = ref(rtdb, `${basePath}/settings`);
      const appliancesRef = ref(rtdb, `${basePath}/appliances`);
      
      console.log(`[SmartGrid] Monitoring User Hardware Path: ${basePath}`);
      
      let lastHeartbeatVal = 0;

      // Watchdog to check if data is stale
      const watchdog = setInterval(() => {
        if (lastHeartbeatVal > 0) {
          const now = Date.now();
          // The ESP32 sends millis() to lastSeen, which isn't a wall clock time.
          // We should rely on the heartbeat or a simple online flag.
          // However, the ESP32 code provided sets isOnline = true in loop.
        }
      }, 5000);
      
      const unsubSensors = onValue(sensorsRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          // The ESP32 code sends power in kW (power / 1000.0)
          const p = (data.power || 0) * 1000; 
          setLivePower(Math.round(p));
          setVoltage(data.voltage || 0);
          setCurrent(data.current || 0);
        }
      });

      const unsubStatus = onValue(statusRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          setIsOnline(data.isOnline || false);
          // We can't easily use lastSeen (millis) for wall clock comparison
          // but we can assume if isOnline is true, it's recently updated.
        } else {
          setIsOnline(false);
        }
      });

      const unsubSettings = onValue(settingsRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          setEcoMode(data.ecoMode || false);
        }
      });

      const unsubAppliances = onValue(ref(rtdb, `${basePath}/status/verified_pins`), (snapshot) => {
        if (snapshot.exists()) {
          setActivePins(snapshot.val());
        } else {
          setActivePins({});
        }
      });

      return () => {
        unsubSensors();
        unsubStatus();
        unsubSettings();
        unsubAppliances();
        clearInterval(watchdog);
      };
    };

    unsubscribePower = setupPowerListener();

    const unsubscribeUser = onSnapshot(userDocRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        const hId = data.hardwareId || null;
        setHardwareId(hId);
      }
    });

    return () => {
      unsubscribeDevices();
      unsubscribeUser();
      unsubscribePower();
    };
  }, []);

  // Add these state variables to the hook
  const [voltage, setVoltage] = useState(0);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!ecoMode || devices.length === 0) return;

    const enforceShedding = async () => {
      const updates: Promise<any>[] = [];
      let changed = false;
      
      for (const device of devices) {
        // Priority 1 = High, Priority 2 = Medium, Priority 3 = Low
        // User's ESP32 code: 
        // if (power > SHED_75) controlByPriority(4, false);
        // if (power > SHED_85) controlByPriority(3, false);
        // if (power > POWER_LIMIT) controlByPriority(2, false);
        
        let shouldBeOff = false;
        const p = livePower;
        const limit = 4000; // Matching ESP32 POWER_LIMIT
        
        if (p > limit) {
          // Shed High (1), Medium (2), and Low (3)
          if (device.priority >= 1) shouldBeOff = true;
        } else if (p > (limit * 0.85)) {
          // Shed Medium (2) and Low (3)
          if (device.priority >= 2) shouldBeOff = true;
        } else if (p > (limit * 0.50)) {
          // Shed Low (3) only
          if (device.priority >= 3) shouldBeOff = true;
        }

        if (shouldBeOff && device.status) {
          const deviceRef = doc(db, 'devices', device.id);
          const basePath = `users/${auth.currentUser.uid}/hardware`;
          const rtdbRef = ref(rtdb, `${basePath}/appliances/${device.id}/command`);
          
          updates.push(updateDoc(deviceRef, { status: false }));
          updates.push(set(rtdbRef, "OFF"));

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
  }, [livePower, ecoMode, devices]);

  const isShedding = ecoMode && (
    (livePower > 3400 && devices.some(d => d.priority >= 2 && !d.status)) ||
    (livePower > 3000 && devices.some(d => d.priority >= 3 && !d.status))
  );

  return { livePower, voltage, current, loadPercentage, ecoMode, devices, lastShedTime, isShedding, hardwareId, isOnline, activePins };
};
