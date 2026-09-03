# Fix Plan: Chat and Feed Posting Issues

## Root Cause Summary

### Chat Issues
1. **Direct Supabase insert bypasses API routes**: `Chat.tsx` inserts directly into `chat_messages` table from browser client (line 159-165), but the API route `src/app/api/community/chat/route.ts` exists for this purpose
2. **Missing auth check**: `user_id: currentUser?.id` (line 162) is `undefined` if profile fetch fails
3. **No error feedback**: Failed sends only restore message text, no user notification

### Feed Issues  
1. **Same direct insert problem**: `Feed.tsx` inserts directly into `community_posts` table (line 217-230) instead of using API route
2. **Missing auth check**: `user_id: currentUser?.id` (line 220) could be `undefined`
3. **Silent failures**: No error message shown to user when post creation fails

### Why It Fails
- **RLS Policies**: Supabase Row Level Security likely requires `auth.uid()` to match `user_id`
- **Browser client auth**: The browser Supabase client may not have the user's session properly established
- **No server verification**: API routes exist with proper auth checks but aren't being used

## Fix Plan

### Step 1: Fix Chat.tsx - Use API Route
**File**: `src/components/community/Chat.tsx`

**Changes**:
1. Modify `sendMessage` function to call API route instead of direct insert
2. Add null check for `currentUser` before allowing send
3. Add error feedback to user

**Before**:
```typescript
const sendMessage = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!newMessage.trim() || !selectedChannel || sending) return;

  setSending(true);
  const content = newMessage.trim();
  setNewMessage('');

  const { error } = await supabase
    .from('chat_messages')
    .insert({
      channel_id: selectedChannel.id,
      user_id: currentUser?.id,
      content
    });

  if (error) {
    setNewMessage(content);
  }
  setSending(false);
};
```

**After**:
```typescript
const sendMessage = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!newMessage.trim() || !selectedChannel || sending || !currentUser) return;

  setSending(true);
  const content = newMessage.trim();
  setNewMessage('');

  try {
    const response = await fetch('/api/community/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel_id: selectedChannel.id,
        content
      })
    });

    if (!response.ok) {
      throw new Error('Failed to send message');
    }
  } catch (error) {
    setNewMessage(content);
    console.error('Error sending message:', error);
  } finally {
    setSending(false);
  }
};
```

### Step 2: Fix Feed.tsx - Use API Route
**File**: `src/components/community/Feed.tsx`

**Changes**:
1. Modify `createPost` function to call API route instead of direct insert
2. Add null check for `currentUser` before allowing post
3. Add error feedback to user

**Before**:
```typescript
const createPost = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!newPost.trim() || submitting) return;

  setSubmitting(true);
  const content = newPost.trim();

  const { data, error } = await supabase
    .from('community_posts')
    .insert({
      user_id: currentUser?.id,
      content,
      category: postCategory
    })
    .select(`
      *,
      profiles:user_id (full_name, avatar_url),
      community_comments (count),
      community_reactions (count)
    `)
    .single();

  if (!error && data) {
    setPosts(prev => [data, ...prev]);
    setNewPost('');
  }
  setSubmitting(false);
};
```

**After**:
```typescript
const createPost = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!newPost.trim() || submitting || !currentUser) return;

  setSubmitting(true);
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
      throw new Error('Failed to create post');
    }

    const result = await response.json();
    if (result.post) {
      setPosts(prev => [result.post, ...prev]);
      setNewPost('');
    }
  } catch (error) {
    console.error('Error creating post:', error);
  } finally {
    setSubmitting(false);
  }
};
```

### Step 3: Add Error State for User Feedback
Add error state variables to both components to show user-friendly error messages.

**Chat.tsx additions**:
- Add `const [error, setError] = useState<string | null>(null);`
- Show error in UI when present
- Clear error on successful send

**Feed.tsx additions**:
- Add `const [error, setError] = useState<string | null>(null);`
- Show error in UI when present
- Clear error on successful post

### Step 4: Verify API Routes Handle Auth Properly
Check that API routes:
1. Verify user authentication via `supabase.auth.getUser()`
2. Use `user.id` from the authenticated user, not from request body
3. Return proper error codes (401 for unauthorized)

Current API routes already do this correctly - they verify auth and use `user.id`.

### Step 5: Test Build
Run `npm run build` to verify no TypeScript errors.

## Files to Modify
1. `src/components/community/Chat.tsx` - Use API route, add error handling
2. `src/components/community/Feed.tsx` - Use API route, add error handling

## Files Already Correct (No Changes Needed)
1. `src/app/api/community/chat/route.ts` - Properly handles auth
2. `src/app/api/community/posts/route.ts` - Properly handles auth
3. `src/lib/supabase/client.ts` - Client setup is correct
4. `src/lib/security.ts` - Sanitization is correct

## Expected Outcome
- Chat messages will send successfully via API route with proper auth
- Feed posts will create successfully via API route with proper auth
- Users will see error messages if something fails
- Build will pass without errors
