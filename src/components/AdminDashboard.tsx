import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Zap, 
  Activity, 
  ShieldCheck,
  Search,
  ArrowRight,
  Smartphone
} from 'lucide-react';
import { motion } from 'motion/react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import { db, auth, rtdb, handleFirestoreError, OperationType } from '../firebase';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface UserData {
  id: string;
  email: string;
  displayName?: string;
  role?: string;
}

interface UserGridData {
  power: number;
  voltage: number;
  current: number;
  status: string;
  motor_status: boolean;
}

const UserRow: React.FC<{ user: UserData }> = ({ user }) => {
  const [gridData, setGridData] = useState<UserGridData | null>(null);
  const [deviceCount, setDeviceCount] = useState(0);

  useEffect(() => {
    // 1. Get the hardwareId from Firestore first
    const userDocRef = doc(db, 'users', user.id);
    let unsubscribeRTDB = () => {};

    const unsubscribeFirestore = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const hId = docSnap.data().hardwareId;
        
        // 2. Listen to RTDB using the hardwareId
        const basePath = hId 
          ? `users/${user.id}/hardware/${hId}`
          : `users/${user.id}/hardware`;
          
        const sensorsRef = ref(rtdb, `${basePath}/sensors/realtime`);
        const statusRef = ref(rtdb, `${basePath}/status`);
        const appliancesRef = ref(rtdb, `${basePath}/appliances`);

        unsubscribeRTDB();

        const unsubSensors = onValue(sensorsRef, (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.val();
            setGridData(prev => ({
              ...prev,
              power: Math.round((data.power || 0) * 1000),
              voltage: data.voltage || 0,
              current: data.current || 0,
              status: 'stable'
            } as UserGridData));
          }
        });

        const unsubStatus = onValue(statusRef, (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.val();
            setGridData(prev => ({
              ...prev,
              status: data.isOnline ? 'online' : 'offline'
            } as UserGridData));
          }
        });

        const unsubAppliances = onValue(appliancesRef, (snapshot) => {
          if (snapshot.exists()) {
            setDeviceCount(Object.keys(snapshot.val()).length);
          } else {
            setDeviceCount(0);
          }
        });

        unsubscribeRTDB = () => {
          unsubSensors();
          unsubStatus();
          unsubAppliances();
        };
      }
    });

    return () => {
      unsubscribeFirestore();
      unsubscribeRTDB();
    };
  }, [user.id]);

  return (
    <motion.tr 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="hover:bg-slate-50/50 transition-colors border-b border-slate-50"
    >
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold">
            {user.email[0].toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-slate-800">{user.displayName || 'User'}</p>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-2 h-2 rounded-full",
            gridData?.status === 'online' ? "bg-emerald-500" : "bg-rose-500"
          )} />
          <span className="text-sm font-bold text-slate-600 capitalize">
            {gridData?.status || 'Offline'}
          </span>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-1 text-emerald-600 font-bold">
          <Zap size={14} />
          {gridData?.power || 0} W
        </div>
      </td>
      <td className="px-6 py-4 text-slate-500 text-sm font-medium">
        {gridData?.voltage || 0}V / {gridData?.current || 0}A
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2 text-slate-600 font-bold text-sm">
          <Smartphone size={14} />
          {deviceCount} Devices
        </div>
      </td>
      <td className="px-6 py-4 text-right">
        <button className="p-2 text-slate-400 hover:text-emerald-500 transition-colors">
          <ArrowRight size={20} />
        </button>
      </td>
    </motion.tr>
  );
};

export const AdminDashboard = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserData));
      setUsers(list);
      setLoading(false);
    }, (error) => {
      console.error("Admin access denied or error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (u.displayName && u.displayName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const totalPower = 0; // This would require a more complex listener or aggregation

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-600 mb-1">
            <ShieldCheck size={20} />
            <span className="text-xs font-bold uppercase tracking-widest">Administrator Portal</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Global Grid Monitor</h1>
          <p className="text-slate-500 mt-1">Overseeing {users.length} active user nodes</p>
        </div>
      </div>

      {/* Admin Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
              <Users size={24} />
            </div>
          </div>
          <h3 className="text-slate-500 text-sm font-medium">Total Users</h3>
          <p className="text-2xl font-bold text-slate-900 mt-1">{users.length}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
              <Activity size={24} />
            </div>
          </div>
          <h3 className="text-slate-500 text-sm font-medium">Active Nodes</h3>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {users.length} <span className="text-sm text-slate-400 font-normal">/ {users.length}</span>
          </p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
              <Zap size={24} />
            </div>
          </div>
          <h3 className="text-slate-500 text-sm font-medium">System Health</h3>
          <p className="text-2xl font-bold text-emerald-600 mt-1">98.2%</p>
        </div>
      </div>

      {/* User Management Table */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-slate-800">User Network</h2>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 text-slate-500 text-xs font-bold uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">User Details</th>
                <th className="px-6 py-4">Grid Status</th>
                <th className="px-6 py-4">Live Power</th>
                <th className="px-6 py-4">V / I</th>
                <th className="px-6 py-4">Devices</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(user => (
                <UserRow key={user.id} user={user} />
              ))}
            </tbody>
          </table>
          {filteredUsers.length === 0 && !loading && (
            <div className="py-20 text-center text-slate-400 font-medium">
              No users found matching your search
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
