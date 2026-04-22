INSERT INTO public.agents (id, name, type, role, emoji, accent) VALUES ('human', 'You', 'Human Operator', 'Director', '👤', '#3b82f6') ON CONFLICT (id) DO NOTHING;
