import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, sanitizeInput } from '@/lib/security';

export async function GET(request: NextRequest) {
  // Rate limiting: 60 requests per minute per user
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const rateLimitResult = checkRateLimit(`posts-get-${ip}`, 60, 60000);
  
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'X-RateLimit-Remaining': '0' } }
    );
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;

  let query = supabase
    .from('community_posts')
    .select(`
      *,
      community_comments (count),
      community_reactions (count)
    `)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // Validate and sanitize category
  const validCategories = ['all', 'geral', 'iniciantes', 'produtos', 'fornecedores', 'anuncios', 'mercado-ads', 'resultados', 'duvidas', 'ia'];
  if (category && validCategories.includes(category) && category !== 'all') {
    query = query.eq('category', category);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
  }

  const userIds = [...new Set((data || []).map((post) => post.user_id))];
  const { data: profiles, error: profilesError } = userIds.length
    ? await supabase.from('profiles').select('id, full_name, avatar_url').in('id', userIds)
    : { data: [], error: null };

  if (profilesError) {
    return NextResponse.json({ error: 'Failed to fetch post authors' }, { status: 500 });
  }

  const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const posts = (data || []).map((post) => ({
    ...post,
    profiles: profilesById.get(post.user_id) || { full_name: 'Usuário', avatar_url: '' }
  }));

  return NextResponse.json({ posts });
}

export async function POST(request: NextRequest) {
  // Rate limiting: 10 requests per minute per user for creating posts
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const rateLimitResult = checkRateLimit(`posts-post-${ip}`, 10, 60000);
  
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'X-RateLimit-Remaining': '0' } }
    );
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { content, category, image_url } = body;

  if (!content || content.trim().length === 0) {
    return NextResponse.json({ error: 'Content is required' }, { status: 400 });
  }

  // Sanitize content
  const sanitizedContent = sanitizeInput(content);
  
  if (sanitizedContent.length > 5000) {
    return NextResponse.json({ error: 'Content too long (max 5000 characters)' }, { status: 400 });
  }

  // Validate category
  const validCategories = ['geral', 'iniciantes', 'produtos', 'fornecedores', 'anuncios', 'mercado-ads', 'resultados', 'duvidas', 'ia'];
  const sanitizedCategory = validCategories.includes(category) ? category : 'geral';

  // Validate image_url if provided
  let sanitizedImageUrl = '';
  if (image_url && typeof image_url === 'string') {
    try {
      const url = new URL(image_url);
      if (['http:', 'https:'].includes(url.protocol)) {
        sanitizedImageUrl = url.toString();
      }
    } catch {
      // Invalid URL, ignore
    }
  }

  const { data, error } = await supabase
    .from('community_posts')
    .insert({
      user_id: user.id,
      content: sanitizedContent,
      category: sanitizedCategory,
      image_url: sanitizedImageUrl
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user.id)
    .single();

  return NextResponse.json({
    post: {
      ...data,
      profiles: profile || { full_name: 'Usuário', avatar_url: '' },
      community_comments: [{ count: 0 }],
      community_reactions: [{ count: 0 }]
    }
  }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  // Rate limiting: 20 requests per minute per user for updating posts
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const rateLimitResult = checkRateLimit(`posts-put-${ip}`, 20, 60000);
  
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'X-RateLimit-Remaining': '0' } }
    );
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { id, content } = body;

  if (!id || !content) {
    return NextResponse.json({ error: 'ID and content are required' }, { status: 400 });
  }

  // Validate ID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 });
  }

  // Sanitize content
  const sanitizedContent = sanitizeInput(content);
  
  if (sanitizedContent.length > 5000) {
    return NextResponse.json({ error: 'Content too long (max 5000 characters)' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('community_posts')
    .update({ content: sanitizedContent })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to update post' }, { status: 500 });
  }

  return NextResponse.json({ post: data });
}

export async function DELETE(request: NextRequest) {
  // Rate limiting: 20 requests per minute per user for deleting posts
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const rateLimitResult = checkRateLimit(`posts-delete-${ip}`, 20, 60000);
  
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'X-RateLimit-Remaining': '0' } }
    );
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  }

  // Validate ID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 });
  }

  const { error } = await supabase
    .from('community_posts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
