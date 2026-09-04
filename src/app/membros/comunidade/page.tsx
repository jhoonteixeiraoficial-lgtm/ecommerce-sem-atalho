'use client';

import { useState } from 'react';
import { MessageCircle, Users, Layout, Bell } from 'lucide-react';
import Feed from '@/components/community/Feed';
import Chat from '@/components/community/Chat';

type Tab = 'feed' | 'chat' | 'members' | 'notifications';

export default function ComunidadePage() {
  const [activeTab, setActiveTab] = useState<Tab>('feed');

  return (
    <div className="h-[calc(100dvh-3.5rem)] flex flex-col">
      <div className="p-4 border-b border-border-subtle">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">Comunidade</h1>
            <p className="text-sm text-text-muted">Conecte-se com outros membros</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 rounded-lg hover:bg-surface-raised transition-colors text-text-secondary relative" onClick={() => alert('Nenhuma notificação nova.')}>
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-accent rounded-full" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex border-b border-border-subtle">
        <button
          onClick={() => setActiveTab('feed')}
          className={`flex-1 p-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'feed'
              ? 'text-accent border-b-2 border-accent'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          <Layout className="w-4 h-4" />
          Feed
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 p-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'chat'
              ? 'text-accent border-b-2 border-accent'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          <MessageCircle className="w-4 h-4" />
          Chat
        </button>
        <button
          onClick={() => setActiveTab('members')}
          className={`flex-1 p-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'members'
              ? 'text-accent border-b-2 border-accent'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          <Users className="w-4 h-4" />
          Membros
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'feed' && <Feed />}
        {activeTab === 'chat' && <Chat />}
        {activeTab === 'members' && (
          <div className="h-full flex flex-col items-center justify-center text-text-muted">
            <Users className="w-12 h-12 mb-2 opacity-50" />
            <p>Em breve</p>
            <p className="text-xs">Lista de membros em desenvolvimento</p>
          </div>
        )}
      </div>
    </div>
  );
}
