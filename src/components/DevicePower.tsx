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
  const [linkedId, setLinkedId] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;

    const userDocRef = doc(db, 'users', auth.currentUser.uid);
    const unsubscribeUser = onSnapshot(userDocRef, (doc) => {
      if (doc.exists()) {
        setLinkedId(doc.data().hardwareId || null);
      }
    });

    return () => unsubscribeUser();
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;

    const basePath = linkedId ? `hardware/${linkedId}` : `users/${auth.currentUser.uid}`;
    const powerRef = ref(rtdb, `${basePath}/devices/${pin}/power`);
    
    const unsubscribe = onValue(powerRef, (snapshot) => {
      if (snapshot.exists()) {
        setPower(snapshot.val());
      } else {
        setPower(0);
      }
    });

    return () => unsubscribe();
  }, [pin, linkedId]);

  return (
    <div className="flex items-center gap-1 text-emerald-600 font-bold">
      <Zap size={14} className="text-emerald-500" />
      {power} W
    </div>
  );
};
