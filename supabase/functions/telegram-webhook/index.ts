// [EN] Follow instructions here: https://supabase.com/docs/guides/functions/deploy
// [ES] Sigue las instrucciones aquí: https://supabase.com/docs/guides/functions/deploy

// Deployment command: supabase functions deploy telegram-webhook --no-verify-jwt

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const formData = await req.formData();
        const chat_id = formData.get('chat_id');
        const token = formData.get('token');
        const caption = formData.get('caption');
        const photo = formData.get('photo'); // Should be a Blob/File

        if (!chat_id || !token || !photo) {
            throw new Error("Missing required fields: chat_id, token, or photo");
        }

        // Construct Telegram URL
        const telegramUrl = `https://api.telegram.org/bot${token}/sendPhoto`;

        // Re-package the form data for Telegram
        const tgFormData = new FormData();
        tgFormData.append('chat_id', chat_id as string);
        tgFormData.append('caption', caption as string);
        tgFormData.append('photo', photo);

        console.log(`Sending alert to Telegram Chat ID: ${chat_id}`);

        // Call Telegram API from the secure backend
        const telegramResponse = await fetch(telegramUrl, {
            method: 'POST',
            body: tgFormData
        });

        const telegramData = await telegramResponse.json();

        if (!telegramResponse.ok) {
            console.error("Telegram API Error:", telegramData);
            throw new Error(`Telegram API responded with ${telegramResponse.status}`);
        }

        return new Response(JSON.stringify({ success: true, data: telegramData }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error("Function Error:", error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
