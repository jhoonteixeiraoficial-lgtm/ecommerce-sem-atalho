'use client'

import { useState, useCallback, useEffect } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import BottomNav from '@/components/layout/BottomNav'

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  const handleCloseSidebar = useCallback(() => setSidebarOpen(false), [])
  const handleOpenSidebar = useCallback(() => setSidebarOpen(true), [])

  useEffect(() => {
    let cancelled = false

    fetch('/api/account/profile')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.role === 'admin') {
          setIsAdmin(true)
        }
      })
      .catch(() => {
        // Never show the admin link speculatively on failure.
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="min-h-screen bg-bg flex">
      <Sidebar open={sidebarOpen} onClose={handleCloseSidebar} isAdmin={isAdmin} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header onMenuToggle={handleOpenSidebar} />
        <main className="flex-1 p-4 pb-24 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
