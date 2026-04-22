import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: agents, error: err1 } = await supabase.from('agents').select('*');
  console.log('Agents:', agents?.map(a => a.id).join(', '), err1?.message || '');

  const { data: messages, error: err2 } = await supabase.from('council_messages').select('*');
  console.log('Council Messages count:', messages?.length, err2?.message || '');
  if (messages && messages.length > 0) {
    console.log('Sample messages:', messages.slice(-5).map(m => `[${m.agent_id}]: ${m.content.slice(0, 50)}...`));
  }
}
check();
