import React, { useState, useEffect } from 'react';
import { Zap } from 'lucide-react';
import { ref, onValue } from 'firebase/database';
import { auth, rtdb } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

interface DevicePowerProps {
  pin: number;
}

export const DevicePower = ({ pin }: DevicePowerProps) => {
  const [power, setPower] = useState<number>(0);

  useEffect(() => {
    if (!auth.currentUser) return;

    const uid = auth.currentUser.uid;
    const userDocRef = doc(db, 'users', uid);
    let unsubscribeRTDB = () => {};

    const unsubscribeFirestore = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const basePath = `users/${uid}/hardware/appliances/${pin}`;
        
        const powerRef = ref(rtdb, `${basePath}/power`);
        
        unsubscribeRTDB();
        unsubscribeRTDB = onValue(powerRef, (snapshot) => {
          if (snapshot.exists()) {
            setPower(snapshot.val());
          } else {
            setPower(0);
          }
        });
      }
    });

    return () => {
      unsubscribeFirestore();
      unsubscribeRTDB();
    };
  }, [pin]);

  return (
    <div className="flex items-center gap-1 text-emerald-600 font-bold">
      <Zap size={14} className="text-emerald-500" />
      {power} W
    </div>
  );
};
