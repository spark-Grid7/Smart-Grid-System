import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { Signup } from './components/Signup';
import { Dashboard } from './components/Dashboard';
import { Analytics } from './components/Analytics';
import { Devices } from './components/Devices';
import { LoadShedding } from './components/LoadShedding';
import { Priorities } from './components/Priorities';
import { Hardware } from './components/Hardware';
import { Schedules } from './components/Schedules';
import { AdminDashboard } from './components/AdminDashboard';
import { Zap } from 'lucide-react';

const PrivateRoute = ({ children, adminOnly = false }: { children: React.ReactNode, adminOnly?: boolean }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="bg-emerald-500 p-4 rounded-3xl text-white shadow-xl shadow-emerald-200 mb-6 animate-bounce">
          <Zap size={40} fill="currentColor" />
        </div>
        <p className="text-slate-500 font-bold text-lg animate-pulse">Initializing SmartGrid...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (adminOnly && user.email !== 'haribenaya32@gmail.com') {
    return <Navigate to="/" />;
  }

  return <Layout>{children}</Layout>;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/analytics" element={<PrivateRoute><Analytics /></PrivateRoute>} />
        <Route path="/devices" element={<PrivateRoute><Devices /></PrivateRoute>} />
        <Route path="/load-shedding" element={<PrivateRoute><LoadShedding /></PrivateRoute>} />
        <Route path="/priorities" element={<PrivateRoute><Priorities /></PrivateRoute>} />
        <Route path="/hardware" element={<PrivateRoute><Hardware /></PrivateRoute>} />
        <Route path="/schedules" element={<PrivateRoute><Schedules /></PrivateRoute>} />
        <Route path="/admin" element={<PrivateRoute adminOnly><AdminDashboard /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;
