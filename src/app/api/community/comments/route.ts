import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, sanitizeInput } from '@/lib/security';

export async function GET(request: NextRequest) {
  // Rate limiting: 60 requests per minute per user
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const rateLimitResult = checkRateLimit(`comments-get-${ip}`, 60, 60000);
  
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
  const postId = searchParams.get('post_id');

  if (!postId) {
    return NextResponse.json({ error: 'Post ID is required' }, { status: 400 });
  }

  // Validate post_id format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(postId)) {
    return NextResponse.json({ error: 'Invalid post ID format' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('community_comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
  }

  const userIds = [...new Set((data || []).map((comment) => comment.user_id))];
  const { data: profiles, error: profilesError } = userIds.length
    ? await supabase.from('profiles').select('id, full_name, avatar_url').in('id', userIds)
    : { data: [], error: null };

  if (profilesError) {
    return NextResponse.json({ error: 'Failed to fetch comment authors' }, { status: 500 });
  }

  const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const comments = (data || []).map((comment) => ({
    ...comment,
    profiles: profilesById.get(comment.user_id) || { full_name: 'Usuário', avatar_url: '' }
  }));

  return NextResponse.json({ comments });
}

export async function POST(request: NextRequest) {
  // Rate limiting: 20 requests per minute per user for creating comments
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const rateLimitResult = checkRateLimit(`comments-post-${ip}`, 20, 60000);
  
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

  const { post_id, content, parent_comment_id } = body;

  if (!post_id || !content || content.trim().length === 0) {
    return NextResponse.json({ error: 'Post ID and content are required' }, { status: 400 });
  }

  // Validate post_id format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(post_id)) {
    return NextResponse.json({ error: 'Invalid post ID format' }, { status: 400 });
  }

  // Validate parent_comment_id if provided
  if (parent_comment_id && !uuidRegex.test(parent_comment_id)) {
    return NextResponse.json({ error: 'Invalid parent comment ID format' }, { status: 400 });
  }

  // Sanitize content
  const sanitizedContent = sanitizeInput(content);
  
  if (sanitizedContent.length > 2000) {
    return NextResponse.json({ error: 'Content too long (max 2000 characters)' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('community_comments')
    .insert({
      post_id,
      user_id: user.id,
      content: sanitizedContent,
      parent_comment_id: parent_comment_id || null
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user.id)
    .single();

  return NextResponse.json({
    comment: {
      ...data,
      profiles: profile || { full_name: 'Usuário', avatar_url: '' }
    }
  }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  // Rate limiting: 20 requests per minute per user for updating comments
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const rateLimitResult = checkRateLimit(`comments-put-${ip}`, 20, 60000);
  
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
  
  if (sanitizedContent.length > 2000) {
    return NextResponse.json({ error: 'Content too long (max 2000 characters)' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('community_comments')
    .update({ content: sanitizedContent })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to update comment' }, { status: 500 });
  }

  return NextResponse.json({ comment: data });
}

export async function DELETE(request: NextRequest) {
  // Rate limiting: 20 requests per minute per user for deleting comments
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const rateLimitResult = checkRateLimit(`comments-delete-${ip}`, 20, 60000);
  
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
    .from('community_comments')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
