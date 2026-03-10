// [EN] Follow instructions here: https://supabase.com/docs/guides/functions/deploy
// [ES] Sigue las instrucciones aquí: https://supabase.com/docs/guides/functions/deploy

// Deployment command: supabase functions deploy telegram-webhook --no-verify-jwt

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// [EN] Deno serve function. Type req as Request to prevent implicit 'any' lint errors in local IDEs.
// [ES] Función serve de Deno. Tipar req como Request para prevenir errores lint de 'any' implícito en IDEs locales.
serve(async (req: Request) => {
    // [EN] Handle CORS preflight / [ES] Manejar pre-vuelo CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const formData = await req.formData();
        const chat_id = formData.get('chat_id');
        const token = formData.get('token');
        const caption = formData.get('caption');
        const photo = formData.get('photo'); // [EN] Should be a Blob/File / [ES] Debería ser un Blob/File

        if (!chat_id || !token || !photo) {
            throw new Error("Missing required fields: chat_id, token, or photo");
        }

        // [EN] Construct Telegram URL / [ES] Construir URL de Telegram
        const telegramUrl = `https://api.telegram.org/bot${token}/sendPhoto`;

        // [EN] Re-package the form data for Telegram / [ES] Re-empaquetar los datos del formulario para Telegram
        const tgFormData = new FormData();
        tgFormData.append('chat_id', chat_id as string);
        tgFormData.append('caption', caption as string);
        tgFormData.append('photo', photo);

        console.log(`Sending alert to Telegram Chat ID: ${chat_id}`);

        // [EN] Call Telegram API from the secure backend / [ES] Llamar a la API de Telegram desde el backend seguro
        const telegramResponse = await fetch(telegramUrl, {
            method: 'POST',
            body: tgFormData
        });

        const telegramData = await telegramResponse.json();

        if (!telegramResponse.ok) {
            console.error("Telegram API Error:", telegramData);
            throw new Error(`Telegram API responded with ${telegramResponse.status}`);
        }

        // [EN] Return Success / [ES] Retornar Éxito
        return new Response(JSON.stringify({ success: true, data: telegramData }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error: any) {
        // [EN] Catch and return exact error / [ES] Atrapar y retornar error exacto
        console.error("Function Error:", error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
