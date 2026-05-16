require('dotenv').config({ override: true });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseKey = (process.env.SUPABASE_ANON_KEY || '').trim();

const ws = require('ws');

if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('YOUR_SUPABASE')) {
    console.error("FATAL ERROR: Supabase credentials missing or invalid in .env");
    module.exports = null;
} else {
    try {
        module.exports = createClient(supabaseUrl, supabaseKey, {
            realtime: {
                transport: ws,
            },
        });
    } catch (e) {

        console.error("FATAL ERROR: Supabase client failed to init.", e.message);
        module.exports = null;
    }
}
