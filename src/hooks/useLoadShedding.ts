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

import { toast } from 'react-toastify';

export const useLoadShedding = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [ecoMode, setEcoMode] = useState(false);
  const [hardwareId, setHardwareId] = useState<string | null>(null);
  const [livePower, setLivePower] = useState(0);
  const [voltage, setVoltage] = useState(230);
  const [current, setCurrent] = useState(0);
  const [lastShedTime, setLastShedTime] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [activePins, setActivePins] = useState<Record<string, boolean>>({});
  const [rtdbApplianceStatus, setRtdbApplianceStatus] = useState<Record<string, boolean>>({});
  const [detectedMac, setDetectedMac] = useState<string | null>(null);
  const [dbConnected, setDbConnected] = useState(false);
  const [rawRtdbData, setRawRtdbData] = useState<any>(null);
  const [dataSource, setDataSource] = useState<string>('None');
  const GRID_CAPACITY = 4000;

  useEffect(() => {
    const connectedRef = ref(rtdb, '.info/connected');
    const unsub = onValue(connectedRef, (snap) => {
      const isConnected = snap.val() === true;
      console.log(`[SmartGrid] RTDB Connection Status: ${isConnected ? 'CONNECTED' : 'DISCONNECTED'}`);
      setDbConnected(isConnected);
    });
    return () => unsub();
  }, []);

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
    
    const setupPowerListener = (mac: string | null) => {
      const uid = auth.currentUser?.uid;
      if (!uid) return () => {};

      // Reset state when switching modes to prevent data leakage
      setLivePower(0);
      setVoltage(230);
      setCurrent(0);
      setIsOnline(false);
      setActivePins({});

      const basePath = mac 
        ? `${uid}/hardware/${mac}`
        : `${uid}/hardware`;
      
      console.log(`[SmartGrid] Monitoring Path: ${basePath}`);
      
      const hardwareRef = ref(rtdb, basePath);
      
      const handleData = (snapshot: any) => {
        if (!snapshot.exists()) {
          setIsOnline(false);
          setLivePower(0);
          return;
        }

        const data = snapshot.val();
        
        // DEEP SEARCH: Find power, voltage, current anywhere in the object
        const findValue = (obj: any, keys: string[]): any => {
          if (!obj || typeof obj !== 'object') return undefined;

          for (const key of keys) {
            if (obj[key] !== undefined) {
              const val = obj[key];
              if (typeof val === 'number') return val;
              if (typeof val === 'string' && !isNaN(parseFloat(val))) return parseFloat(val);
            }
          }

          for (const key in obj) {
            if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
              const val = findValue(obj[key], keys);
              if (val !== undefined) return val;
            }
          }
          return undefined;
        };

        // Explicitly look for the structure: sensors/realtime
        const rt = data.sensors?.realtime || data.info?.sensors?.realtime || data.realtime || data;
        
        const p = findValue(rt, ['power', 'p', 'watts', 'P', 'realtime_power', 'load']) ?? 0;
        const v = findValue(rt, ['voltage', 'v', 'V', 'volts', 'line_voltage']) ?? 230;
        const i = findValue(rt, ['current', 'i', 'I', 'amps', 'line_current']) ?? 0;

        let finalP = p;
        if (v > 100 && p > 0 && p < 20) {
          finalP = p * 1000; 
        }
        
        if (i > 0.01) {
          const calculatedP = i * v;
          if (finalP < 0.1 && calculatedP > 0.1) {
            finalP = calculatedP;
          }
        }

        setLivePower(Math.round(finalP));
        setVoltage(Math.round(v));
        setCurrent(Number(i.toFixed(3)));
        setIsOnline(true);
        setDataSource(snapshot.ref.toString());
        setRawRtdbData(data);

        // Handle Status & Settings
        const status = data.status || data.info?.status;
        const settings = data.settings || data.info?.settings;
        const appliances = data.appliances || data.info?.appliances;

        if (settings?.ecoMode !== undefined) setEcoMode(settings.ecoMode);
        if (settings?.macAddress !== undefined) setDetectedMac(settings.macAddress);

        if (appliances) {
          const statusMap: Record<string, boolean> = {};
          const pins: Record<number, boolean> = {};
          Object.entries(appliances).forEach(([id, app]: [string, any]) => {
            if (app) {
              if (typeof app.status === 'boolean') {
                statusMap[id] = app.status;
              } else if (app.command === "ON") {
                statusMap[id] = true;
              } else if (app.command === "OFF") {
                statusMap[id] = false;
              }
              if (app.pin !== undefined) {
                pins[app.pin] = statusMap[id];
              }
            }
          });
          setRtdbApplianceStatus(statusMap);
          setActivePins(pins);
        }
      };

      const unsub = onValue(hardwareRef, handleData);

      return () => {
        unsub();
      };
    };

    const unsubscribeUser = onSnapshot(userDocRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        const hId = data.hardwareId || null;
        setHardwareId(hId);
        
        unsubscribePower();
        unsubscribePower = setupPowerListener(hId);
      }
    });

    return () => {
      unsubscribeDevices();
      unsubscribeUser();
      unsubscribePower();
    };
  }, [auth.currentUser]);

  useEffect(() => {
    if (!ecoMode || devices.length === 0) return;

    const enforceShedding = async () => {
      const updates: Promise<any>[] = [];
      let changed = false;
      const shedDevices: string[] = [];
      
      const p = livePower;
      const limit = 4000; 
      
      console.log(`[SmartGrid] Checking Shedding - Power: ${p}W, Limit: ${limit}W, Eco: ${ecoMode}`);

      for (const device of devices) {
        let shouldBeOff = false;
        
        if (p >= limit) {
          if (device.priority >= 1) shouldBeOff = true;
        } else if (p >= (limit * 0.85)) {
          if (device.priority >= 2) shouldBeOff = true;
        } else if (p >= (limit * 0.70)) {
          if (device.priority >= 3) shouldBeOff = true;
        }

        if (shouldBeOff && device.status) {
          console.log(`[SmartGrid] SHEDDING DEVICE: ${device.name} (Priority ${device.priority})`);
          const deviceRef = doc(db, 'devices', device.id);
          const basePath = hardwareId 
            ? `${auth.currentUser.uid}/hardware/${hardwareId}`
            : `${auth.currentUser.uid}/hardware`;
          
          const rtdbRef = ref(rtdb, `${basePath}/appliances/${device.id}/command`);
          
          updates.push(updateDoc(deviceRef, { status: false }));
          updates.push(set(rtdbRef, "OFF"));

          changed = true;
          shedDevices.push(device.name);
        }
      }

      if (updates.length > 0) {
        try {
          await Promise.all(updates);
          if (changed) {
            setLastShedTime(new Date().toLocaleTimeString());
            toast.warning(`Load Shedding Active: Turned off ${shedDevices.join(', ')} due to high power load (${livePower}W)`, {
              position: "top-right",
              autoClose: 5000,
              hideProgressBar: false,
              closeOnClick: true,
              pauseOnHover: true,
              draggable: true,
            });
          }
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

  // Merge Firestore devices with RTDB real-time status
  const mergedDevices = devices.map(d => ({
    ...d,
    status: rtdbApplianceStatus[d.id] !== undefined ? rtdbApplianceStatus[d.id] : d.status
  }));

  return { livePower, voltage, current, loadPercentage, ecoMode, devices: mergedDevices, lastShedTime, isShedding, hardwareId, isOnline, activePins, detectedMac, dbConnected, rawRtdbData, dataSource };
};
