import { createClient } from '@supabase/supabase-js'

export const authHandler = async (req, res, next) => {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        res.status(401).send("Unauthorized user.");
    }
    next();
};