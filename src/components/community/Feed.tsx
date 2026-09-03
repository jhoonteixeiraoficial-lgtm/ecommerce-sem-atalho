'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Heart, MessageCircle, Send, Edit2, Trash2, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  attemptReactionOperation,
  createReactionOperationTracker,
  type ReactionOperationTracker,
} from './reaction-operation';
import {
  createRefreshScheduler,
  createSyncGeneration,
  normalizeFeedPosts,
} from './community-realtime';

interface Post {
  id: string;
  user_id: string;
  content: string;
  category: string;
  image_url: string;
  is_pinned: boolean;
  is_edited: boolean;
  edited_at: string | null;
  created_at: string;
  profiles: {
    full_name: string;
    avatar_url: string;
  };
  community_comments: { count: number }[];
  community_reactions: { count: number }[];
}

interface Comment {
  id: string;
  post_id: string;
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

interface Reactions {
  reactions: Record<string, number>;
  userReactions: string[];
  total: number;
}

interface UserProfile {
  id: string;
  full_name: string;
  avatar_url: string;
}

const categories = [
  { id: 'all', name: 'Todos' },
  { id: 'geral', name: 'Geral' },
  { id: 'iniciantes', name: 'Iniciantes' },
  { id: 'produtos', name: 'Produtos' },
  { id: 'fornecedores', name: 'Fornecedores' },
  { id: 'anuncios', name: 'Anúncios' },
  { id: 'mercado-ads', name: 'Mercado Ads' },
  { id: 'resultados', name: 'Resultados' },
  { id: 'duvidas', name: 'Dúvidas' },
  { id: 'ia', name: 'IA' }
];

export default function Feed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPost, setNewPost] = useState('');
  const [postCategory, setPostCategory] = useState('geral');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [expandedComments, setExpandedComments] = useState<string[]>([]);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [newComment, setNewComment] = useState<Record<string, string>>({});
  const [reactions, setReactions] = useState<Record<string, Reactions>>({});
  const [editingPost, setEditingPost] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeError, setRealtimeError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [supabase] = useState(() => createClient());
  const [activeCategory] = useState({ value: selectedCategory });
  const [locallySubmittedPosts] = useState(() => new Set<string>());
  const [feedGenerations] = useState(createSyncGeneration);
  const [reactionGenerations] = useState(createSyncGeneration);
  const reactionOperations = useRef<ReactionOperationTracker | null>(null);
  reactionOperations.current ??= createReactionOperationTracker();
  const reactionOperationTracker = reactionOperations.current;

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
    const category = selectedCategory;
    const run = feedGenerations.begin();
    let polling: ReturnType<typeof setInterval> | null = null;
    let requestInFlight = false;
    let requestQueued = false;

    const fetchPosts = async () => {
      if (requestInFlight) {
        requestQueued = true;
        return;
      }
      requestInFlight = true;

      try {
        const params = new URLSearchParams({ limit: '50' });
        if (category !== 'all') params.set('category', category);
        const response = await fetch(`/api/community/posts?${params}`, { signal: run.signal });
        const result = await response.json();
        if (!run.isCurrent()) return;

        if (!response.ok) {
          setError(result.error || 'Erro ao carregar publicações');
        } else {
          const snapshot = normalizeFeedPosts<Post>(result.posts || [], category);
          const snapshotIds = new Set(snapshot.map((post) => post.id));
          setPosts((current) => {
            const retainedLocal = current.filter((post) => (
              locallySubmittedPosts.has(post.id) && !snapshotIds.has(post.id)
            ));
            for (const id of snapshotIds) locallySubmittedPosts.delete(id);
            return normalizeFeedPosts([...retainedLocal, ...snapshot], category);
          });
        }
      } catch (fetchError) {
        if (!run.isCurrent() || (fetchError instanceof DOMException && fetchError.name === 'AbortError')) return;
        setError('Erro de conexão ao carregar publicações');
      } finally {
        requestInFlight = false;
        if (run.isCurrent()) setLoading(false);
        if (requestQueued && run.isCurrent()) {
          requestQueued = false;
          void fetchPosts();
        }
      }
    };

    const refresh = createRefreshScheduler(() => void fetchPosts(), 250);
    const handleChange = () => refresh.request();
    const enableFallback = () => {
      void fetchPosts();
      polling ??= setInterval(() => void fetchPosts(), 15000);
    };

    const channel = supabase
      .channel('community-posts')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_posts'
        },
        handleChange
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'community_comments' }, handleChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'community_reactions' }, handleChange)
      .subscribe((status) => {
        if (!run.isCurrent()) return;
        if (status === 'SUBSCRIBED') {
          setRealtimeError(null);
          void fetchPosts();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRealtimeError('Atualizações em tempo real indisponíveis. Atualização automática ativada.');
          enableFallback();
        }
      });

    return () => {
      feedGenerations.cancel();
      refresh.cancel();
      if (polling) clearInterval(polling);
      supabase.removeChannel(channel);
    };
  }, [selectedCategory, supabase, feedGenerations, locallySubmittedPosts, refreshVersion]);

  useEffect(() => {
    if (posts.length === 0) {
      reactionGenerations.cancel();
      return;
    }

    const run = reactionGenerations.begin();

    const fetchReactions = async () => {
      const postIds = posts.map(p => p.id);

      const { data } = await supabase
        .from('community_reactions')
        .select('post_id, reaction_type, user_id')
        .in('post_id', postIds)
        .abortSignal(run.signal);

      if (!run.isCurrent()) return;

      const reactionsMap: Record<string, Reactions> = {};

      for (const post of posts) {
        const postReactions = (data || []).filter((r: { post_id: string }) => r.post_id === post.id);

        const grouped = postReactions.reduce((acc: Record<string, number>, r: { reaction_type: string }) => {
          acc[r.reaction_type] = (acc[r.reaction_type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        const userReactions = postReactions
          .filter((r: { user_id: string }) => r.user_id === currentUser?.id)
          .map((r: { reaction_type: string }) => r.reaction_type);

        reactionsMap[post.id] = {
          reactions: grouped,
          userReactions,
          total: postReactions.length
        };
      }

      setReactions(reactionsMap);
    };

    void fetchReactions();
    return () => reactionGenerations.cancel();
  }, [posts, currentUser, supabase, reactionGenerations]);

  const createPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPost.trim() || submitting) return;

    setSubmitting(true);
    setError(null);
    const content = newPost.trim();

    try {
      const response = await fetch('/api/community/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          category: postCategory
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Create post error:', errorData.error);
        setError(errorData.error || 'Erro ao criar post');
      } else {
        const result = await response.json();
        if (result.post) {
          locallySubmittedPosts.add(result.post.id);
          setPosts((current) => normalizeFeedPosts(
            [...current, result.post],
            activeCategory.value,
          ));
        }
        setNewPost('');
        setPostCategory('geral');
      }
    } catch (err) {
      console.error('Create post error:', err);
      setError('Erro de conexão ao criar post');
    }
    setSubmitting(false);
  };

  const updatePost = async (postId: string) => {
    if (!editContent.trim()) return;

    try {
      const response = await fetch('/api/community/posts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: postId,
          content: editContent.trim()
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || 'Erro ao editar post');
        return;
      }

      setPosts(prev => prev.map(p =>
        p.id === postId
          ? { ...p, content: editContent.trim(), is_edited: true }
          : p
      ));
      setEditingPost(null);
      setEditContent('');
    } catch (err) {
      console.error('Update post error:', err);
      setError('Erro de conexão ao editar post');
    }
  };

  const deletePost = async (postId: string) => {
    if (!confirm('Tem certeza que deseja excluir este post?')) return;

    try {
      const response = await fetch(`/api/community/posts?id=${postId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || 'Erro ao excluir post');
        return;
      }

      setPosts(prev => prev.filter(p => p.id !== postId));
    } catch (err) {
      console.error('Delete post error:', err);
      setError('Erro de conexão ao excluir post');
    }
  };

  const toggleReactions = async (postId: string, reactionType: string) => {
    if (!currentUser) {
      setError('Você precisa estar logado para reagir');
      return;
    }

    try {
      const succeeded = await attemptReactionOperation(
        reactionOperationTracker,
        postId,
        reactionType,
        async (operationId) => {
          const response = await fetch('/api/community/reactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              post_id: postId,
              reaction_type: reactionType,
              operation_id: operationId
            })
          });

          if (!response.ok) {
            const errorData = await response.json();
            setError(errorData.error || 'Erro ao reagir');
            return false;
          }

          await response.json();
          return true;
        },
      );
      if (!succeeded) return;

      const reactionsResponse = await fetch(`/api/community/reactions?post_id=${postId}`);
      if (reactionsResponse.ok) {
        const data = await reactionsResponse.json();
        setReactions(prev => ({
          ...prev,
          [postId]: {
            reactions: data.reactions || {},
            userReactions: data.userReactions || [],
            total: data.total || 0
          }
        }));
      }
    } catch (err) {
      console.error('Toggle reaction error:', err);
      setError('Erro de conexão ao reagir');
    }
  };

  const fetchComments = async (postId: string) => {
    try {
      const response = await fetch(`/api/community/comments?post_id=${postId}`);
      if (response.ok) {
        const data = await response.json();
        setComments(prev => ({ ...prev, [postId]: data.comments || [] }));
      }
    } catch (err) {
      console.error('Fetch comments error:', err);
    }
  };

  const toggleComments = async (postId: string) => {
    if (expandedComments.includes(postId)) {
      setExpandedComments(prev => prev.filter(id => id !== postId));
    } else {
      setExpandedComments(prev => [...prev, postId]);
      if (!comments[postId]) {
        await fetchComments(postId);
      }
    }
  };

  const addComment = async (postId: string) => {
    const content = newComment[postId]?.trim();
    if (!content) return;

    try {
      const response = await fetch('/api/community/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id: postId,
          content
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Add comment error:', errorData.error);
        setError(errorData.error || 'Erro ao adicionar comentário');
        return;
      }

      const result = await response.json();
      const comment = result.comment || result;
      setComments(prev => ({
        ...prev,
        [postId]: [...(prev[postId] || []), comment]
      }));
      setNewComment(prev => ({ ...prev, [postId]: '' }));

      setPosts(prev => prev.map(p =>
        p.id === postId
          ? { ...p, community_comments: [{ count: ((p.community_comments?.[0]?.count) || 0) + 1 }] }
          : p
      ));
    } catch (err) {
      console.error('Add comment error:', err);
      setError('Erro de conexão ao adicionar comentário');
    }
  };

  const deleteComment = async (commentId: string, postId: string) => {
    try {
      const response = await fetch(`/api/community/comments?id=${commentId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || 'Erro ao excluir comentário');
        return;
      }

      setComments(prev => ({
        ...prev,
        [postId]: (prev[postId] || []).filter(c => c.id !== commentId)
      }));

      setPosts(prev => prev.map(p =>
        p.id === postId
          ? { ...p, community_comments: [{ count: Math.max(0, ((p.community_comments?.[0]?.count) || 1) - 1) }] }
          : p
      ));
    } catch (err) {
      console.error('Delete comment error:', err);
      setError('Erro de conexão ao excluir comentário');
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

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      geral: 'bg-accent/20 text-accent',
      iniciantes: 'bg-green-500/20 text-green-400',
      produtos: 'bg-blue-500/20 text-blue-400',
      fornecedores: 'bg-purple-500/20 text-purple-400',
      anuncios: 'bg-orange-500/20 text-orange-400',
      'mercado-ads': 'bg-yellow-500/20 text-yellow-400',
      resultados: 'bg-emerald-500/20 text-emerald-400',
      duvidas: 'bg-cyan-500/20 text-cyan-400',
      ia: 'bg-pink-500/20 text-pink-400'
    };
    return colors[category] || 'bg-accent/20 text-accent';
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border-subtle">
        <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-accent" />
          Feed da Comunidade
        </h2>
      </div>

      <div className="p-4 border-b border-border-subtle">
        <form onSubmit={createPost} className="flex gap-2">
          <div className="w-10 h-10 rounded-full bg-surface-raised border border-border flex items-center justify-center text-xs font-medium text-text-secondary flex-shrink-0">
            {currentUser?.avatar_url ? (
              <img
                src={currentUser.avatar_url}
                alt={currentUser.full_name}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              getInitials(currentUser?.full_name || 'U')
            )}
          </div>
          <div className="flex-1">
            <textarea
              value={newPost}
              onChange={(e) => setNewPost(e.target.value)}
              placeholder="O que você está pensando?"
              rows={3}
              className="w-full bg-surface border border-border-subtle rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors resize-none"
            />
            <div className="flex justify-end mt-2 gap-2 items-center">
              <select
                value={postCategory}
                onChange={(e) => setPostCategory(e.target.value)}
                className="px-3 py-1.5 bg-surface border border-border-subtle rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent"
              >
                {categories.filter(c => c.id !== 'all').map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <button
                type="submit"
                disabled={!newPost.trim() || submitting}
                className="px-4 py-2 bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-medium transition-colors"
              >
                {submitting ? 'Publicando...' : 'Publicar'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {error && (
        <div className="mx-4 my-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">fechar</button>
        </div>
      )}

      {realtimeError && (
        <div className="mx-4 my-2 flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
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

      <div className="p-2 border-b border-border-subtle overflow-x-auto flex gap-2">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => {
              activeCategory.value = cat.id;
              setLoading(true);
              setError(null);
              setRealtimeError(null);
              setExpandedComments([]);
              setComments({});
              setPosts((current) => normalizeFeedPosts(current, cat.id));
              setSelectedCategory(cat.id);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              selectedCategory === cat.id
                ? 'bg-accent text-white'
                : 'bg-surface-raised text-text-secondary hover:bg-surface hover:text-text-primary'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-text-muted">
            <MessageCircle className="w-12 h-12 mb-2 opacity-50" />
            <p>Nenhum post ainda</p>
            <p className="text-xs">Seja o primeiro a postar!</p>
          </div>
        ) : (
          posts.map((post) => (
            <div
              key={post.id}
              className="bg-surface rounded-xl border border-border-subtle p-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-surface-raised border border-border flex items-center justify-center text-xs font-medium text-text-secondary flex-shrink-0">
                  {post.profiles?.avatar_url ? (
                    <img
                      src={post.profiles.avatar_url}
                      alt={post.profiles.full_name}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    getInitials(post.profiles?.full_name || 'U')
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary text-sm">
                      {post.profiles?.full_name}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getCategoryColor(post.category)}`}>
                      {post.category}
                    </span>
                    {post.is_pinned && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent/20 text-accent">
                        Fixado
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-text-muted">
                      {formatDistanceToNow(new Date(post.created_at), {
                        addSuffix: true,
                        locale: ptBR
                      })}
                    </span>
                    {post.is_edited && (
                      <span className="text-xs text-text-muted">(editado)</span>
                    )}
                  </div>
                </div>
                {post.user_id === currentUser?.id && (
                  <div className="relative">
                    <button
                      onClick={() => {
                        setEditingPost(post.id);
                        setEditContent(post.content);
                      }}
                      className="p-1 rounded-lg hover:bg-surface-raised transition-colors text-text-muted"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deletePost(post.id)}
                      className="p-1 rounded-lg hover:bg-red-500/10 transition-colors text-text-muted hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {editingPost === post.id ? (
                <div className="mt-3">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={3}
                    className="w-full bg-surface border border-border-subtle rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors resize-none"
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      onClick={() => {
                        setEditingPost(null);
                        setEditContent('');
                      }}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium text-text-secondary hover:bg-surface-raised transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => updatePost(post.id)}
                      className="px-3 py-1.5 bg-accent hover:bg-accent/90 rounded-lg text-sm font-medium transition-colors"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3">
                  <p className="text-text-primary text-sm whitespace-pre-wrap">
                    {post.content}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border-subtle">
                <button
                  onClick={() => toggleReactions(post.id, 'like')}
                  className={`flex items-center gap-1.5 text-xs transition-colors p-1.5 rounded-lg min-w-[44px] min-h-[44px] justify-center ${
                    reactions[post.id]?.userReactions?.includes('like')
                      ? 'text-red-400'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${
                    reactions[post.id]?.userReactions?.includes('like') ? 'fill-current' : ''
                  }`} />
                  <span>{reactions[post.id]?.reactions?.like || 0}</span>
                </button>

                <button
                  onClick={() => toggleComments(post.id)}
                  className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors p-1.5 rounded-lg min-w-[44px] min-h-[44px] justify-center"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>{post.community_comments?.[0]?.count || 0}</span>
                </button>
              </div>

              {expandedComments.includes(post.id) && (
                <div className="mt-3 pt-3 border-t border-border-subtle space-y-3">
                  {(comments[post.id] || []).map((comment) => (
                    <div key={comment.id} className="flex gap-2">
                      <div className="w-7 h-7 rounded-full bg-surface-raised border border-border flex items-center justify-center text-[10px] font-medium text-text-secondary flex-shrink-0">
                        {comment.profiles?.avatar_url ? (
                          <img
                            src={comment.profiles.avatar_url}
                            alt={comment.profiles.full_name}
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          getInitials(comment.profiles?.full_name || 'U')
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="bg-surface-raised rounded-xl px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-text-primary">
                              {comment.profiles?.full_name}
                            </span>
                            <span className="text-[10px] text-text-muted">
                              {formatDistanceToNow(new Date(comment.created_at), {
                                addSuffix: true,
                                locale: ptBR
                              })}
                            </span>
                            {comment.is_edited && (
                              <span className="text-[10px] text-text-muted">(editado)</span>
                            )}
                          </div>
                          <p className="text-xs text-text-primary mt-1">
                            {comment.content}
                          </p>
                        </div>
                        {comment.user_id === currentUser?.id && (
                          <button
                            onClick={() => deleteComment(comment.id, post.id)}
                            className="text-[10px] text-text-muted hover:text-red-400 mt-1"
                          >
                            Excluir
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newComment[post.id] || ''}
                      onChange={(e) => setNewComment(prev => ({ ...prev, [post.id]: e.target.value }))}
                      placeholder="Escreva um comentário..."
                      className="flex-1 bg-surface border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          addComment(post.id);
                        }
                      }}
                    />
                    <button
                      onClick={() => addComment(post.id)}
                      disabled={!newComment[post.id]?.trim()}
                      className="p-2 bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
                    >
                      <Send className="w-3 h-3 text-white" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
