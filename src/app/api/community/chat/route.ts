import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, sanitizeInput } from '@/lib/security';

export async function GET(request: NextRequest) {
  // Rate limiting: 100 requests per minute per user
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const rateLimitResult = checkRateLimit(`chat-get-${ip}`, 100, 60000);
  
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
  const channelId = searchParams.get('channel_id');

  if (!channelId) {
    const { data: channels, error: channelsError } = await supabase
      .from('chat_channels')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (channelsError) {
      return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 });
    }

    return NextResponse.json({ channels });
  }

  // Validate channel_id format (should be UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(channelId)) {
    return NextResponse.json({ error: 'Invalid channel ID format' }, { status: 400 });
  }

  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));
  const offset = (page - 1) * limit;

  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }

  const userIds = [...new Set((data || []).map((message) => message.user_id))];
  const { data: profiles, error: profilesError } = userIds.length
    ? await supabase.from('profiles').select('id, full_name, avatar_url').in('id', userIds)
    : { data: [], error: null };

  if (profilesError) {
    return NextResponse.json({ error: 'Failed to fetch message authors' }, { status: 500 });
  }

  const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const messages = (data || []).reverse().map((message) => ({
    ...message,
    profiles: profilesById.get(message.user_id) || { full_name: 'Usuário', avatar_url: '' }
  }));

  return NextResponse.json({ messages });
}

export async function POST(request: NextRequest) {
  // Rate limiting: 30 requests per minute per user for creating messages
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const rateLimitResult = checkRateLimit(`chat-post-${ip}`, 30, 60000);
  
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

  const { channel_id, content } = body;

  if (!channel_id || !content || content.trim().length === 0) {
    return NextResponse.json({ error: 'Channel ID and content are required' }, { status: 400 });
  }

  // Validate channel_id format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(channel_id)) {
    return NextResponse.json({ error: 'Invalid channel ID format' }, { status: 400 });
  }

  // Sanitize content
  const sanitizedContent = sanitizeInput(content);
  
  if (sanitizedContent.length > 1000) {
    return NextResponse.json({ error: 'Message too long (max 1000 characters)' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      channel_id,
      user_id: user.id,
      content: sanitizedContent
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to create message' }, { status: 500 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user.id)
    .single();

  return NextResponse.json({
    message: {
      ...data,
      profiles: profile || { full_name: 'Usuário', avatar_url: '' }
    }
  }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  // Rate limiting: 20 requests per minute per user for updating messages
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const rateLimitResult = checkRateLimit(`chat-put-${ip}`, 20, 60000);
  
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

  const { data, error } = await supabase
    .from('chat_messages')
    .update({ content: sanitizedContent })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to update message' }, { status: 500 });
  }

  return NextResponse.json({ message: data });
}

export async function DELETE(request: NextRequest) {
  // Rate limiting: 20 requests per minute per user for deleting messages
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const rateLimitResult = checkRateLimit(`chat-delete-${ip}`, 20, 60000);
  
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
    .from('chat_messages')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: 'Failed to delete message' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
