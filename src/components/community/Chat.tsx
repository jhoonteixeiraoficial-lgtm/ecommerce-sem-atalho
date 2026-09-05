'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Send, Hash, MessageCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  createChannelComposer,
  createRefreshScheduler,
  createRealtimeRecovery,
  createSnapshotCoordinator,
  createSyncGeneration,
  mergeChronological,
} from './community-realtime';

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

interface ChatProps {
  /** When provided, auto-selects this channel (by slug) once channels load, skipping the channel list. */
  initialChannelSlug?: string
}

export default function Chat({ initialChannelSlug }: ChatProps = {}) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [, setComposerVersion] = useState(0);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [realtimeError, setRealtimeError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [composer] = useState(createChannelComposer);
  const [syncGenerations] = useState(createSyncGeneration);
  const [supabase] = useState(() => createClient());
  const channelSending = selectedChannel ? composer.isSending(selectedChannel.id) : false;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('community_profiles')
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
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Mobile browsers (notably iOS Safari) suspend the realtime WebSocket when
  // the tab/app is backgrounded (lock screen, app switch) without always
  // firing CHANNEL_ERROR/CLOSED on the channel. Force a full resubscribe and
  // refetch whenever the page becomes visible/online again so messages sent
  // while backgrounded are not missed.
  useEffect(() => {
    const resync = () => setRefreshVersion((version) => version + 1);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') resync();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', resync);
    window.addEventListener('online', resync);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', resync);
      window.removeEventListener('online', resync);
    };
  }, []);

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
    if (!initialChannelSlug || selectedChannel || channels.length === 0) return
    const target = channels.find((c) => c.slug === initialChannelSlug)
    if (!target) return
    composer.setActiveChannel(target.id)
    setMessages([])
    setLoading(true)
    setError(null)
    setRealtimeError(null)
    setSelectedChannel(target)
    setNewMessage(composer.getDraft(target.id))
  }, [initialChannelSlug, channels, selectedChannel, composer])

  useEffect(() => {
    if (!selectedChannel) return;

    const channelId = selectedChannel.id;
    const run = syncGenerations.begin();
    const snapshots = createSnapshotCoordinator<Message[]>({
      load: async (signal) => {
        const response = await fetch(`/api/community/chat?channel_id=${channelId}&limit=100`, {
          signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Erro ao carregar mensagens');
        return result.messages || [];
      },
      apply: (snapshot) => {
        setMessages(mergeChronological([], snapshot));
        setLoading(false);
      },
      onError: () => {
        setError('Erro de conexão ao carregar mensagens');
        setLoading(false);
      },
    });

    const refresh = createRefreshScheduler(() => void snapshots.refresh(), 250);
    // Fallback poll only kicks in once the channel actually reports a
    // failure (CHANNEL_ERROR/TIMED_OUT/CLOSED), not continuously - an
    // always-on short poll was too aggressive for constrained mobile
    // devices/networks (overlapping requests could pile up and destabilize
    // the page). 5s keeps recovery snappy without the constant overhead.
    const recovery = createRealtimeRecovery(() => void snapshots.refresh(), 5000);

    // TEMPORARY DIAGNOSTIC (remove once mobile realtime is confirmed fixed):
    // on some mobile networks (carrier-grade NAT/proxies) the WebSocket join
    // handshake can hang forever without the client library ever calling the
    // subscribe callback with an error status - it just silently never
    // reaches SUBSCRIBED. The existing recovery only reacts to an explicit
    // CHANNEL_ERROR/TIMED_OUT/CLOSED, so that failure mode was never
    // detected. This watchdog forces a fallback + full reconnect if the
    // channel hasn't confirmed SUBSCRIBED within a bounded time.
    let joinConfirmed = false;
    const joinWatchdog = setTimeout(() => {
      if (joinConfirmed || !run.isCurrent()) return;
      console.warn('[chat-rt] join timeout - no SUBSCRIBED status after 8s, forcing reconnect');
      setRealtimeError('Atualizações em tempo real indisponíveis. Atualização automática ativada.');
      recovery.failed();
      setRefreshVersion((version) => version + 1);
    }, 8000);

    console.log('[chat-rt] subscribing to channel', channelId);

    const channel = supabase
      .channel(`chat:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `channel_id=eq.${channelId}`
        },
        async (payload: { eventType: string; new: Record<string, unknown> }) => {
          if (!run.isCurrent()) return;
          console.log('[chat-rt] postgres_changes event received', payload.eventType, payload.new?.id);
          snapshots.invalidate();
          refresh.request();
          if (payload.eventType !== 'INSERT') {
            return;
          }

          const { data: profile } = await supabase
            .from('community_profiles')
            .select('full_name, avatar_url')
            .eq('id', payload.new.user_id)
            .single();

          if (!run.isCurrent() || payload.new.channel_id !== channelId) return;

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

          setMessages((current) => mergeChronological(current, [newMessage]));
        }
      )
      .subscribe((status) => {
        console.log('[chat-rt] subscribe status', status);
        if (!run.isCurrent()) return;
        if (status === 'SUBSCRIBED') {
          joinConfirmed = true;
          clearTimeout(joinWatchdog);
          recovery.recovered();
          setRealtimeError(null);
          void snapshots.refresh();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          joinConfirmed = true;
          clearTimeout(joinWatchdog);
          setRealtimeError('Atualizações em tempo real indisponíveis. Atualização automática ativada.');
          recovery.failed();
        }
      });

    return () => {
      clearTimeout(joinWatchdog);
      syncGenerations.cancel();
      snapshots.cancel();
      refresh.cancel();
      recovery.cancel();
      supabase.removeChannel(channel);
    };
  }, [selectedChannel, supabase, syncGenerations, refreshVersion]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChannel || channelSending) return;

    setError(null);
    const content = newMessage.trim();
    const channelId = selectedChannel.id;
    const operation = composer.beginSend(channelId, content);
    setComposerVersion((version) => version + 1);
    setNewMessage(composer.getDraft(channelId));

    try {
      const response = await fetch('/api/community/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_id: channelId,
          content: content
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Chat error:', errorData.error);
        if (composer.fail(operation) && composer.isActive(channelId)) {
          setError(errorData.error || 'Erro ao enviar mensagem');
          setNewMessage(composer.getDraft(channelId));
        }
      } else {
        const result = await response.json();
        if (composer.succeed(operation) && result.message && composer.isActive(channelId)) {
          setMessages((current) => mergeChronological(current, [result.message]));
        }
      }
    } catch (err) {
      console.error('Chat error:', err);
      if (composer.fail(operation) && composer.isActive(channelId)) {
        setError('Erro de conexão ao enviar mensagem');
        setNewMessage(composer.getDraft(channelId));
      }
    } finally {
      setComposerVersion((version) => version + 1);
    }
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
              onClick={() => {
                composer.setActiveChannel(channel.id);
                setMessages([]);
                setLoading(true);
                setError(null);
                setRealtimeError(null);
                setSelectedChannel(channel);
                setNewMessage(composer.getDraft(channel.id));
              }}
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
          onClick={() => {
            composer.setDraft(selectedChannel.id, newMessage);
            composer.setActiveChannel(null);
            setSelectedChannel(null);
            setNewMessage('');
          }}
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

      {realtimeError && (
        <div className="mx-4 mb-2 flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
          <span>{realtimeError}</span>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setRealtimeError(null);
              setRefreshVersion((version) => version + 1);
            }}
            className="flex items-center gap-1 underline"
          >
            <RefreshCw className="h-3 w-3" />
            Atualizar
          </button>
        </div>
      )}

      <form onSubmit={sendMessage} className="p-4 border-t border-border-subtle">
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              composer.setDraft(selectedChannel.id, e.target.value);
            }}
            placeholder="Digite sua mensagem..."
            maxLength={1000}
            disabled={channelSending}
            className="flex-1 bg-surface border border-border-subtle rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || channelSending}
            className="px-4 py-3 bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
          >
            <Send className="w-5 h-5 text-white" />
          </button>
        </div>
      </form>
    </div>
  );
}
