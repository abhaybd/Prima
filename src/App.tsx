import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { DashboardView } from './views/DashboardView'
import { PlayView } from './views/PlayView'
import { ReportView } from './views/ReportView'
import { SettingsView } from './views/SettingsView'

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<PlayView />} />
        <Route path="/settings" element={<SettingsView />} />
        <Route path="/dashboard" element={<DashboardView />} />
        <Route path="/report/:gameId" element={<ReportView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
