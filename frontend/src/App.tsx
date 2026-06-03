import { ThemeProvider } from './contexts/ThemeContext'
import { BackgroundProvider } from './contexts/BackgroundContext'
import { ChatProvider } from './contexts/ChatContext'
import { SettingsProvider } from './contexts/SettingsContext'
import { DebugPanelProvider } from './contexts/DebugPanelContext'
import { AppLayout } from './components/layout/AppLayout'
import { DebugPanel } from './components/debug/DebugPanel'
import { SettingsModal } from './components/settings/SettingsModal'
import { BackgroundSettings } from './components/settings/BackgroundSettings'
import { useState } from 'react'

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [bgOpen, setBgOpen] = useState(false)

  return (
    <ThemeProvider>
      <BackgroundProvider>
        <SettingsProvider>
          <ChatProvider>
            <DebugPanelProvider>
              <div className="h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col overflow-hidden">
                <AppLayout
                  onOpenSettings={() => setSettingsOpen(true)}
                  onOpenBackground={() => setBgOpen(true)}
                />
                <DebugPanel />
                {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
                {bgOpen && <BackgroundSettings onClose={() => setBgOpen(false)} />}
              </div>
            </DebugPanelProvider>
          </ChatProvider>
        </SettingsProvider>
      </BackgroundProvider>
    </ThemeProvider>
  )
}
