
-- Direct messages between users
CREATE TABLE public.direct_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL,
  recipient_id UUID NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dm_pair ON public.direct_messages (sender_id, recipient_id, created_at DESC);
CREATE INDEX idx_dm_recipient ON public.direct_messages (recipient_id, created_at DESC);

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own messages"
  ON public.direct_messages FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE POLICY "Users send messages as themselves"
  ON public.direct_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND sender_id <> recipient_id
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND (is_banned = true OR is_muted = true)
    )
  );

CREATE POLICY "Recipients mark read"
  ON public.direct_messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = recipient_id);

CREATE POLICY "Senders delete own messages"
  ON public.direct_messages FOR DELETE
  TO authenticated
  USING (auth.uid() = sender_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
ALTER TABLE public.direct_messages REPLICA IDENTITY FULL;

-- Admin-authored public posts
CREATE TABLE public.posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id UUID NOT NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 10000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_posts_created ON public.posts (created_at DESC);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Posts viewable by authenticated"
  ON public.posts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins manage posts"
  ON public.posts FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND auth.uid() = author_id);

CREATE TRIGGER posts_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
ALTER TABLE public.posts REPLICA IDENTITY FULL;
