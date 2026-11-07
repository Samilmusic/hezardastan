import { createClient } from '@supabase/supabase-js';
export function createPortalAuth(url,key,options={}) {
  return createClient(url,key,{global:{fetch:options.fetch},auth:{storage:options.storage,storageKey:'avaye-hezardastan.session.v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}}).auth;
}
