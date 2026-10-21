import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import SchoolWebsite from './pages/SchoolWebsite.tsx'
import Login from './pages/Login.tsx'
import AdminDashboard from './pages/AdminDashboard.tsx'
import SuperAdminLogin from './pages/SuperAdminLogin'
import SuperAdminDashboard from './pages/SuperAdminDashboard'
import Attendance from './pages/Attendance.tsx'
import TeacherDashboard from './pages/TeacherDashboard.tsx'
import FinancePage from './pages/FinancePage.tsx'
import StudentDashboard from './pages/StudentDashboard.tsx'
import SchoolProfile from './pages/SchoolProfile.tsx'
import PlatformManagement from './pages/PlatformManagement'
import PlatformLogin from './pages/PlatformLogin'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/school/:slug" element={<SchoolWebsite />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/finance" element={<FinancePage />} />
        <Route path="/admin/school-profile" element={<SchoolProfile />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/teacher" element={<TeacherDashboard />} />
        <Route path="/student" element={<StudentDashboard />} />
              <Route path="/super-admin/login" element={<SuperAdminLogin />} />
      <Route path="/super-admin" element={<SuperAdminDashboard />} />
      <Route path="/super-admin/platform" element={<PlatformManagement />} />
        <Route path="/platform/login" element={<PlatformLogin />} />
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
