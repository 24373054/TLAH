import { ThemeProvider } from './contexts/ThemeContext'
import { ChatProvider } from './contexts/ChatContext'
import { SettingsProvider } from './contexts/SettingsContext'
import { DebugPanelProvider } from './contexts/DebugPanelContext'
import { AppLayout } from './components/layout/AppLayout'
import { DebugPanel } from './components/debug/DebugPanel'
import { SettingsModal } from './components/settings/SettingsModal'
import { useState } from 'react'

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <ThemeProvider>
      <SettingsProvider>
        <ChatProvider>
          <DebugPanelProvider>
            <div className="h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col overflow-hidden">
              <AppLayout onOpenSettings={() => setSettingsOpen(true)} />
              <DebugPanel />
              {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
            </div>
          </DebugPanelProvider>
        </ChatProvider>
      </SettingsProvider>
    </ThemeProvider>
  )
}
