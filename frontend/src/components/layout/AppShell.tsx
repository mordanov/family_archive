import { Outlet } from 'react-router-dom'
import { Topbar } from './Topbar'
import { Sidebar } from './Sidebar'
import { UploadQueue } from '@/components/upload/UploadQueue'
import { Toaster } from 'react-hot-toast'
import { RenameDialog } from '@/components/dialogs/RenameDialog'
import { ShareDialog } from '@/components/dialogs/ShareDialog'

export function AppShell() {
  return (
    <div className="flex h-dvh w-full flex-col">
      <Topbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto bg-surface-muted">
          <Outlet />
        </main>
      </div>
      <UploadQueue />
      <RenameDialog />
      <ShareDialog />
      <Toaster position="bottom-left" />
    </div>
  )
}

