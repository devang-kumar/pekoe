const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey || supabaseUrl === 'YOUR_SUPABASE_URL') {
    console.error("FATAL ERROR: Supabase URL or Anon Key is missing in .env");
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
