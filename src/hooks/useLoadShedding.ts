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
        ? `users/${uid}/hardware/${mac}`
        : `users/${uid}/hardware`;
      
      console.log(`[SmartGrid] Monitoring Path: ${basePath}`);
      
      const hardwareRef = ref(rtdb, basePath);
      const rootRef = mac ? ref(rtdb, `hardware/${mac}`) : null;
      
      const handleData = (snapshot: any) => {
        if (!snapshot.exists()) return null;

        const data = snapshot.val();
        console.log("[SmartGrid] Raw Data Keys:", Object.keys(data));
        
        // DEEP SEARCH: Find power, voltage, current anywhere in the object
        const findValue = (obj: any, keys: string[]): any => {
          if (!obj || typeof obj !== 'object') return undefined;

          // 1. Check direct keys first (highest priority)
          for (const key of keys) {
            if (obj[key] !== undefined) {
              const val = obj[key];
              if (typeof val === 'number') return val;
              if (typeof val === 'string' && !isNaN(parseFloat(val))) return parseFloat(val);
            }
          }

          // 2. Recurse into children ONLY if they are objects
          // This prevents picking up random numbers from arrays or primitive values (like pin 26)
          for (const key in obj) {
            if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
              const val = findValue(obj[key], keys);
              if (val !== undefined) return val;
            }
          }
          return undefined;
        };

        // Explicitly look for the structure in the screenshot: info/sensors/realtime
        const rt = data.info?.sensors?.realtime || data.sensors?.realtime || data.realtime;
        
        const p = findValue(rt || data, ['power', 'p', 'watts', 'P', 'realtime_power', 'load']) ?? 0;
        const v = findValue(rt || data, ['voltage', 'v', 'V', 'volts', 'line_voltage']) ?? 230;
        const i = findValue(rt || data, ['current', 'i', 'I', 'amps', 'line_current']) ?? 0;

        console.log(`[SmartGrid] Raw Found - P: ${p}, V: ${v}, I: ${i}`);

        // Scaling logic: Only scale if voltage is high (AC) and power is tiny (kW)
        // For DC systems (like 5V), we use the values exactly as they are.
        let finalP = p;
        if (v > 100 && p > 0 && p < 20) {
          finalP = p * 1000; // Assume kW -> W for AC
        }
        
        // POWER CALCULATION LOGIC:
        // If reported power is 0 or suspiciously inconsistent with V*I, recalculate
        if (i > 0.01) {
          const calculatedP = i * v;
          // If reported power is near zero but we have current, use calculated
          if (finalP < 0.1 && calculatedP > 0.1) {
            console.log(`[SmartGrid] Using Calculated Power: ${Math.round(calculatedP)}W (based on ${i}A * ${v}V)`);
            finalP = calculatedP;
          }
        }

        // 2. Handle Status & Online State
        let online = false;
        let pins = {};
        const status = data.status || data.info?.status;
        const settings = data.settings || data.info?.settings;
        const appliances = data.appliances || data.info?.appliances;

        if (status) {
          const lastSeen = status.lastSeen;
          const now = Date.now();
          const isRecentlySeen = lastSeen ? (now - lastSeen < 300000) : true; // 5 minute grace
          online = (status.isOnline || false) && isRecentlySeen;
          if (status.verified_pins) pins = status.verified_pins;
        } 
        
        // Fallback: if we see power or voltage changing, it's online
        if (!online && (finalP > 0 || (v > 100 && v < 300))) {
          online = true;
        }

        return {
          power: Math.round(finalP),
          voltage: v,
          current: i || (finalP / (v || 230)),
          online,
          pins,
          ecoMode: settings?.ecoMode || false,
          detectedMac: settings?.macAddress || null,
          appliances: appliances || null,
          raw: data
        };
      };

      // Track data from both paths
      let primaryData: any = null;
      let rootData: any = null;

      const updateMergedState = () => {
        // CRITICAL: Prioritize the data source that is actually ONLINE or has POWER
        // This solves the issue where the 'empty' user folder was blocking the 'active' root folder
        const isPrimaryActive = !!primaryData && (primaryData.online || primaryData.power > 0 || primaryData.current > 0);
        const isRootActive = !!rootData && (rootData.online || rootData.power > 0 || rootData.current > 0);

        console.log(`[SmartGrid] Data Sync - Primary: ${isPrimaryActive ? 'ACTIVE' : 'IDLE'}, Root: ${isRootActive ? 'ACTIVE' : 'IDLE'}`);

        const merged = isPrimaryActive 
          ? { ...primaryData, source: 'User Hardware Path' } 
          : isRootActive
            ? { ...rootData, source: 'Root MAC Path' }
            : primaryData ? { ...primaryData, source: 'User Hardware Path (Idle)' } : rootData ? { ...rootData, source: 'Root MAC Path (Idle)' } : null;

        if (merged) {
          setLivePower(merged.power);
          setVoltage(merged.voltage);
          setCurrent(merged.current);
          setIsOnline(merged.online);
          setActivePins(merged.pins || {});
          setDataSource(merged.source || 'Unknown');
          if (merged.ecoMode !== undefined) setEcoMode(merged.ecoMode);
          if (merged.detectedMac !== undefined) setDetectedMac(merged.detectedMac);
          
          if (merged.appliances) {
            const statusMap: Record<string, boolean> = {};
            Object.entries(merged.appliances).forEach(([id, app]: [string, any]) => {
              if (app) {
                if (typeof app.status === 'boolean') {
                  statusMap[id] = app.status;
                } else if (app.command === "ON") {
                  statusMap[id] = true;
                } else if (app.command === "OFF") {
                  statusMap[id] = false;
                }
              }
            });
            setRtdbApplianceStatus(statusMap);
          }
          setRawRtdbData(merged.raw);
        } else {
          setIsOnline(false);
          setLivePower(0);
          setRawRtdbData(null);
        }
      };

      const unsubPrimary = onValue(hardwareRef, (snapshot) => {
        primaryData = handleData(snapshot);
        updateMergedState();
      });

      let unsubRoot = () => {};
      if (rootRef) {
        unsubRoot = onValue(rootRef, (snapshot) => {
          rootData = handleData(snapshot);
          updateMergedState();
        });
      }

      return () => {
        unsubPrimary();
        unsubRoot();
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
          const basePath = hardwareId 
            ? `users/${auth.currentUser.uid}/hardware/${hardwareId}`
            : `users/${auth.currentUser.uid}/hardware`;
          
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

  // Merge Firestore devices with RTDB real-time status
  const mergedDevices = devices.map(d => ({
    ...d,
    status: rtdbApplianceStatus[d.id] !== undefined ? rtdbApplianceStatus[d.id] : d.status
  }));

  return { livePower, voltage, current, loadPercentage, ecoMode, devices: mergedDevices, lastShedTime, isShedding, hardwareId, isOnline, activePins, detectedMac, dbConnected, rawRtdbData, dataSource };
};
