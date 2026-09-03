import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/security';

export async function POST(request: NextRequest) {
  // Rate limiting: 30 requests per minute per user for reactions
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const rateLimitResult = checkRateLimit(`reactions-post-${ip}`, 30, 60000);
  
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

  const { post_id, reaction_type } = body;

  if (!post_id || !reaction_type) {
    return NextResponse.json({ error: 'Post ID and reaction type are required' }, { status: 400 });
  }

  // Validate post_id format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(post_id)) {
    return NextResponse.json({ error: 'Invalid post ID format' }, { status: 400 });
  }

  const validReactions = ['like', 'love', 'fire', 'clap'];
  if (!validReactions.includes(reaction_type)) {
    return NextResponse.json({ error: 'Invalid reaction type' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('community_reactions')
    .select('id')
    .eq('post_id', post_id)
    .eq('user_id', user.id)
    .eq('reaction_type', reaction_type)
    .single();

  if (existing) {
    const { error } = await supabase
      .from('community_reactions')
      .delete()
      .eq('id', existing.id);

    if (error) {
      return NextResponse.json({ error: 'Failed to remove reaction' }, { status: 500 });
    }

    return NextResponse.json({ removed: true });
  }

  const { data, error } = await supabase
    .from('community_reactions')
    .insert({
      post_id,
      user_id: user.id,
      reaction_type
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to add reaction' }, { status: 500 });
  }

  return NextResponse.json({ reaction: data }, { status: 201 });
}

export async function GET(request: NextRequest) {
  // Rate limiting: 60 requests per minute per user
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const rateLimitResult = checkRateLimit(`reactions-get-${ip}`, 60, 60000);
  
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
    .from('community_reactions')
    .select('*')
    .eq('post_id', postId);

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch reactions' }, { status: 500 });
  }

  const reactions = data || [];
  const grouped = reactions.reduce((acc: Record<string, number>, r: { reaction_type: string }) => {
    acc[r.reaction_type] = (acc[r.reaction_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const userReactions = reactions
    .filter((r: { user_id: string }) => r.user_id === user.id)
    .map((r: { reaction_type: string }) => r.reaction_type);

  return NextResponse.json({ 
    reactions: grouped,
    userReactions,
    total: reactions.length
  });
}
