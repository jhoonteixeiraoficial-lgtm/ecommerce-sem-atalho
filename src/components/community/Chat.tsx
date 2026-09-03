'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Send, Hash, MessageCircle, Users, ArrowLeft } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Channel {
  id: string;
  name: string;
  description: string;
  slug: string;
  icon: string;
  is_active: boolean;
}

interface Message {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  is_edited: boolean;
  edited_at: string | null;
  created_at: string;
  profiles: {
    full_name: string;
    avatar_url: string;
  };
}

interface UserProfile {
  id: string;
  full_name: string;
  avatar_url: string;
}

export default function Chat() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [supabase] = useState(() => createClient());

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .eq('id', user.id)
          .single();
        
        if (profile) {
          setCurrentUser(profile);
        }
      }
    };

    getUser();
  }, [supabase]);

  useEffect(() => {
    const fetchChannels = async () => {
      const { data, error } = await supabase
        .from('chat_channels')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (!error && data) {
        setChannels(data);
      }
    };

    fetchChannels();
  }, [supabase]);

  useEffect(() => {
    if (!selectedChannel) return;

    const fetchMessages = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/community/chat?channel_id=${selectedChannel.id}&limit=100`);
        const result = await response.json();
        if (!response.ok) {
          setError(result.error || 'Erro ao carregar mensagens');
        } else {
          setMessages(result.messages || []);
        }
        setTimeout(scrollToBottom, 100);
      } catch {
        setError('Erro de conexão ao carregar mensagens');
      }
      setLoading(false);
    };

    fetchMessages();

    const channel = supabase
      .channel(`chat:${selectedChannel.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `channel_id=eq.${selectedChannel.id}`
        },
        async (payload: { new: Record<string, unknown> }) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, avatar_url')
            .eq('id', payload.new.user_id)
            .single();

          const newMessage: Message = {
            id: payload.new.id as string,
            channel_id: payload.new.channel_id as string,
            user_id: payload.new.user_id as string,
            content: payload.new.content as string,
            is_edited: payload.new.is_edited as boolean,
            edited_at: payload.new.edited_at as string | null,
            created_at: payload.new.created_at as string,
            profiles: profile || { full_name: 'Usuário', avatar_url: '' }
          };

          setMessages(prev => prev.some((message) => message.id === newMessage.id)
            ? prev
            : [...prev, newMessage]);
          setTimeout(scrollToBottom, 100);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedChannel, supabase, scrollToBottom]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChannel || sending) return;

    setSending(true);
    setError(null);
    const content = newMessage.trim();
    setNewMessage('');

    try {
      const response = await fetch('/api/community/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_id: selectedChannel.id,
          content: content
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Chat error:', errorData.error);
        setError(errorData.error || 'Erro ao enviar mensagem');
        setNewMessage(content);
      } else {
        const result = await response.json();
        if (result.message) {
          setMessages(prev => prev.some((message) => message.id === result.message.id)
            ? prev
            : [...prev, result.message]);
          setTimeout(scrollToBottom, 100);
        }
      }
    } catch (err) {
      console.error('Chat error:', err);
      setError('Erro de conexão ao enviar mensagem');
      setNewMessage(content);
    }
    setSending(false);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getIcon = (icon: string) => {
    const icons: Record<string, React.ReactNode> = {
      'message-circle': <MessageCircle className="w-4 h-4" />,
      'help-circle': <MessageCircle className="w-4 h-4" />,
      'shopping-bag': <MessageCircle className="w-4 h-4" />,
      'package': <MessageCircle className="w-4 h-4" />,
      'megaphone': <MessageCircle className="w-4 h-4" />,
      'target': <MessageCircle className="w-4 h-4" />,
      'trophy': <MessageCircle className="w-4 h-4" />,
      'brain': <MessageCircle className="w-4 h-4" />
    };
    return icons[icon] || <Hash className="w-4 h-4" />;
  };

  if (!selectedChannel) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-4 border-b border-border-subtle">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-accent" />
            Chat da Comunidade
          </h2>
          <p className="text-sm text-text-muted mt-1">
            Selecione um canal para começar
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {channels.map((channel) => (
            <button
              key={channel.id}
              onClick={() => setSelectedChannel(channel)}
              className="w-full p-3 rounded-lg hover:bg-surface-raised transition-colors flex items-center gap-3 text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-surface-raised border border-border-subtle flex items-center justify-center text-accent">
                {getIcon(channel.icon)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-text-primary truncate">
                  {channel.name}
                </div>
                <div className="text-xs text-text-muted truncate">
                  {channel.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border-subtle flex items-center gap-3">
        <button
          onClick={() => setSelectedChannel(null)}
          className="p-2.5 rounded-lg hover:bg-surface-raised transition-colors text-text-secondary min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h2 className="font-semibold text-text-primary flex items-center gap-2">
            {getIcon(selectedChannel.icon)}
            {selectedChannel.name}
          </h2>
          <p className="text-xs text-text-muted">
            {selectedChannel.description}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-text-muted">
            <MessageCircle className="w-12 h-12 mb-2 opacity-50" />
            <p>Nenhuma mensagem ainda</p>
            <p className="text-xs">Seja o primeiro a escrever!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.user_id === currentUser?.id ? 'flex-row-reverse' : ''}`}
            >
              <div className="w-8 h-8 rounded-full bg-surface-raised border border-border flex items-center justify-center text-xs font-medium text-text-secondary flex-shrink-0">
                {msg.profiles?.avatar_url ? (
                  <img
                    src={msg.profiles.avatar_url}
                    alt={msg.profiles.full_name}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  getInitials(msg.profiles?.full_name || 'U')
                )}
              </div>
              <div className={`flex-1 max-w-[70%] ${msg.user_id === currentUser?.id ? 'text-right' : ''}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-text-primary">
                    {msg.user_id === currentUser?.id ? 'Você' : msg.profiles?.full_name}
                  </span>
                  <span className="text-xs text-text-muted">
                    {formatDistanceToNow(new Date(msg.created_at), { 
                      addSuffix: true,
                      locale: ptBR 
                    })}
                  </span>
                </div>
                <div
                  className={`inline-block p-3 rounded-xl text-sm ${
                    msg.user_id === currentUser?.id
                      ? 'bg-accent text-white rounded-tr-none'
                      : 'bg-surface-raised border border-border-subtle text-text-primary rounded-tl-none'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="mx-4 mb-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">fechar</button>
        </div>
      )}

      <form onSubmit={sendMessage} className="p-4 border-t border-border-subtle">
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Digite sua mensagem..."
            maxLength={1000}
            disabled={sending}
            className="flex-1 bg-surface border border-border-subtle rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="px-4 py-3 bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
          >
            <Send className="w-5 h-5 text-white" />
          </button>
        </div>
      </form>
    </div>
  );
}
