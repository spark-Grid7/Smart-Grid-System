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

  // Merge Firestore devices with RTDB real-time status
  const mergedDevices = devices.map(d => ({
    ...d,
    status: rtdbApplianceStatus[d.id] !== undefined ? rtdbApplianceStatus[d.id] : d.status
  }));

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
      const uid = auth.currentUser?.uid?.trim();
      if (!uid) return () => {};

      // Reset state when switching modes to prevent data leakage
      setIsOnline(false);
      setActivePins({});

      const basePath = `users/${uid}/hardware`;
      
      console.log(`[SmartGrid] Monitoring Path: ${basePath}`);
      
      const hardwareRef = ref(rtdb, basePath);
      
      const handleData = (snapshot: any) => {
        if (!snapshot.exists()) {
          setIsOnline(false);
          setLivePower(0);
          return;
        }

        const data = snapshot.val();
        
        // 1. Detect MAC address from sub-nodes (e.g., B0CBD8E96884)
        // This explains "how" it shows even when not linked - the app scans for active signatures
        let macFound: string | null = null;
        Object.keys(data).forEach(key => {
          if (key.length === 12 && /^[0-9A-F]+$/.test(key)) {
            macFound = key;
          }
        });
        if (macFound) setDetectedMac(macFound);

        // 2. Determine the correct data source (nested or flat)
        // If we have a linked hardwareId and it exists as a sub-node, use that
        const hId = hardwareId; // from Firestore
        const nestedData = hId && data[hId] ? data[hId] : (macFound && data[macFound] ? data[macFound] : null);
        
        // Merge nested data with flat data (flat data takes priority for simulation)
        const mergedData = { ...nestedData, ...data };

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
        const rt = mergedData.sensors?.realtime || mergedData.info?.sensors?.realtime || mergedData.realtime || mergedData;
        
        const p = findValue(rt, ['power', 'p', 'watts', 'P', 'realtime_power', 'load']) ?? 0;
        const v = findValue(rt, ['voltage', 'v', 'V', 'volts', 'line_voltage']) ?? 230;
        const i = findValue(rt, ['current', 'i', 'I', 'amps', 'line_current']) ?? 0;

        let finalP = p;
        
        if (i > 0.01 && finalP < 0.1) {
          finalP = i * v;
        }

        setLivePower(Math.round(finalP));
        setVoltage(Math.round(v));
        setCurrent(Number(i.toFixed(3)));
        setIsOnline(true);
        setDataSource(snapshot.ref.toString());
        setRawRtdbData(data);

        // Handle Status & Settings
        const status = mergedData.status || mergedData.info?.status;
        const settings = mergedData.settings || mergedData.info?.settings;
        const appliances = mergedData.appliances || mergedData.info?.appliances;

        // Improved Online Status Check: Check if lastSeen is within last 15 seconds
        const lastSeen = status?.lastSeen || 0;
        const now = Date.now();
        const isRecentlySeen = (now - lastSeen) < 15000;
        
        setIsOnline(isRecentlySeen);

        if (settings?.ecoMode !== undefined) setEcoMode(settings.ecoMode);
        if (settings?.macAddress !== undefined) setDetectedMac(settings.macAddress);

        // Handle verified pins from status
        if (status?.verified_pins) {
          setActivePins(status.verified_pins);
        }

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
    if (!ecoMode || mergedDevices.length === 0) return;

    const enforceShedding = async () => {
      const updates: Promise<any>[] = [];
      let changed = false;
      const shedDevices: string[] = [];
      
      const p = livePower;
      const limit = 4000; 
      const loadPct = (p / limit) * 100;
      
      console.log(`[SmartGrid] Checking Shedding - Power: ${p}W (${loadPct.toFixed(1)}%), Limit: ${limit}W, Eco: ${ecoMode}`);

      for (const device of mergedDevices) {
        let shouldBeOff = false;
        
        // Thresholds:
        // > 85% (High): Priority 2, 3 off
        // > 75% (Warning): Priority 3 off
        // Priority 1: NEVER OFF (per user request)
        
        if (loadPct >= 85) {
          if (device.priority >= 2) shouldBeOff = true;
        } else if (loadPct >= 75) {
          if (device.priority >= 3) shouldBeOff = true;
        }

        if (shouldBeOff && device.status) {
          console.log(`[SmartGrid] SHEDDING DEVICE: ${device.name} (Priority ${device.priority})`);
          const deviceRef = doc(db, 'devices', device.id);
          const uid = auth.currentUser?.uid?.trim();
          if (!uid) continue;
          
          // Use MAC subfolder if detected to avoid "two branches"
          const activeMac = hardwareId || detectedMac;
          const basePath = activeMac 
            ? `users/${uid}/hardware/${activeMac}` 
            : `users/${uid}/hardware`;

          const rtdbCmdRef = ref(rtdb, `${basePath}/appliances/${device.id}/command`);
          const rtdbStatusRef = ref(rtdb, `${basePath}/appliances/${device.id}/status`);
          
          updates.push(updateDoc(deviceRef, { status: false }));
          updates.push(set(rtdbCmdRef, "OFF"));
          updates.push(set(rtdbStatusRef, false));

          changed = true;
          shedDevices.push(device.name);
        }
      }

      if (updates.length > 0) {
        try {
          await Promise.all(updates);
          if (changed) {
            setLastShedTime(new Date().toLocaleTimeString());
            // Show separate toasts for each device as requested
            shedDevices.forEach(name => {
              toast.warning(`Load Shedding: ${name} turned off to protect grid`, {
                position: "top-right",
                autoClose: 4000,
              });
            });
          }
        } catch (e) {
          console.error("Rapid shedding failed", e);
        }
      }
    };

    enforceShedding();
  }, [livePower, ecoMode, mergedDevices]);

  const isShedding = ecoMode && (
    (loadPercentage >= 85 && mergedDevices.some(d => d.priority >= 2 && d.status)) ||
    (loadPercentage >= 75 && mergedDevices.some(d => d.priority >= 3 && d.status))
  );

  return { livePower, voltage, current, loadPercentage, ecoMode, devices: mergedDevices, lastShedTime, isShedding, hardwareId, isOnline, activePins, detectedMac, dbConnected, rawRtdbData, dataSource };
};
