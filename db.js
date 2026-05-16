require('dotenv').config({ override: true });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseKey = (process.env.SUPABASE_ANON_KEY || '').trim();

console.log("Debug - URL length:", supabaseUrl.length);
console.log("Debug - Key length:", supabaseKey.length);
console.log("Debug - URL is placeholder:", supabaseUrl === 'YOUR_SUPABASE_URL');
console.log("Debug - Key is placeholder:", supabaseKey === 'YOUR_SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseKey || supabaseUrl === 'YOUR_SUPABASE_URL' || supabaseKey === 'YOUR_SUPABASE_ANON_KEY') {
    console.error("FATAL ERROR: Supabase URL or Anon Key is missing or invalid in .env");
    console.error("Please create a project at supabase.com and add your credentials to .env");
    // We don't exit(1) here to allow nodemon to stay alive, but the client will be null
    module.exports = null;
} else {
    try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        module.exports = supabase;
    } catch (e) {
        console.error("FATAL ERROR: Failed to initialize Supabase client.", e.message);
        module.exports = null;
    }
}
