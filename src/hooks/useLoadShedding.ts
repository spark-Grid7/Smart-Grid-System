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
      const rootRef = mac ? ref(rtdb, mac) : null;
      
      const handleData = (snapshot: any) => {
        if (!snapshot.exists()) return null;

        const data = snapshot.val();
        
        // 1. Handle Power/Voltage/Current
        let p = 0;
        let v = 230;
        let i = 0;

        // Support both direct and nested 'info' structure
        const sensors = data.sensors || data.info?.sensors;
        const status = data.status || data.info?.status;
        const settings = data.settings || data.info?.settings;
        const appliances = data.appliances || data.info?.appliances;

        if (mac) {
          if (sensors?.realtime) {
            const rt = sensors.realtime;
            p = typeof rt === 'number' ? rt : (rt.power || 0);
            v = rt.voltage || 230;
            i = rt.current || 0;
          }
        } else {
          // Simulation Mode: Be flexible
          if (typeof data === 'number') {
            p = data;
          } else if (sensors?.realtime) {
            const rt = sensors.realtime;
            p = typeof rt === 'number' ? rt : (rt.power || 0);
            v = rt.voltage || 230;
            i = rt.current || 0;
          } else if (data.power !== undefined) {
            p = data.power;
            v = data.voltage || 230;
            i = data.current || 0;
          }
        }

        // Scaling logic: if < 20, assume kW and convert to W
        const finalP = p > 20 ? p : p * 1000;
        
        // 2. Handle Status & Online State
        let online = false;
        let pins = {};
        if (status) {
          const lastSeen = status.lastSeen;
          const now = Date.now();
          const isRecentlySeen = lastSeen ? (now - lastSeen < 60000) : true;
          online = (status.isOnline || false) && isRecentlySeen;
          if (status.verified_pins) pins = status.verified_pins;
        } else {
          if (p > 0 || v !== 230) online = true;
        }

        return {
          power: Math.round(finalP),
          voltage: v,
          current: i || (finalP / v),
          online,
          pins,
          ecoMode: settings?.ecoMode || false,
          detectedMac: settings?.macAddress || null,
          appliances: appliances || null
        };
      };

      // Track data from both paths
      let primaryData: any = null;
      let rootData: any = null;

      const updateMergedState = () => {
        // CRITICAL: Prioritize the data source that is actually ONLINE or has POWER
        // This solves the issue where the 'empty' user folder was blocking the 'active' root folder
        const isPrimaryActive = primaryData?.online || (primaryData?.power && primaryData.power > 0);
        const isRootActive = rootData?.online || (rootData?.power && rootData.power > 0);

        console.log(`[SmartGrid] Data Sync - Primary: ${isPrimaryActive ? 'ACTIVE' : 'IDLE'}, Root: ${isRootActive ? 'ACTIVE' : 'IDLE'}`);

        const merged = isPrimaryActive 
          ? primaryData 
          : isRootActive
            ? rootData
            : primaryData || rootData;

        if (merged) {
          setLivePower(merged.power);
          setVoltage(merged.voltage);
          setCurrent(merged.current);
          setIsOnline(merged.online);
          setActivePins(merged.pins);
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
        } else {
          setIsOnline(false);
          setLivePower(0);
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

  return { livePower, voltage, current, loadPercentage, ecoMode, devices: mergedDevices, lastShedTime, isShedding, hardwareId, isOnline, activePins, detectedMac };
};
