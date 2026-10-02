// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This code runs on Supabase Edge Functions (Deno Runtime)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const PAGBANK_SANDBOX_URL = "https://sandbox.api.pagseguro.com/orders";
const PAGBANK_PROD_URL = "https://api.pagseguro.com/orders";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();

    // Obtém o token das variáveis secretas do Supabase ou usa o token configurado
    const pagbankToken = Deno.env.get("PAGBANK_TOKEN") || "f9c937b3-7fc9-4f96-99d9-86746a4898288193ffbb4c12b3640bdc1b30178dda4d8a2d-5308-4b6b-be92-7d470297fe03";
    const envMode = Deno.env.get("PAGBANK_ENV") || "sandbox";
    const targetUrl = envMode === "production" ? PAGBANK_PROD_URL : PAGBANK_SANDBOX_URL;

    console.log(`[PagBank] Enviando pedido para ${targetUrl}:`, payload.reference_id);

    const pagbankResponse = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${pagbankToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseData = await pagbankResponse.json();

    if (!pagbankResponse.ok) {
      console.error("[PagBank] Erro retornado pela API:", responseData);
      return new Response(
        JSON.stringify({
          success: false,
          error: responseData.error_messages ? responseData.error_messages.map((e: any) => e.description).join(", ") : "Pagamento não autorizado.",
          raw: responseData,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Identifica o status da cobrança
    const charge = responseData.charges?.[0];
    const isPaid = charge?.status === "PAID" || charge?.status === "AUTHORIZED";

    return new Response(
      JSON.stringify({
        success: true,
        id: responseData.id,
        reference_id: responseData.reference_id,
        chargeId: charge?.id,
        status: charge?.status || "WAITING",
        isPaid: isPaid,
        raw: responseData,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("[PagBank Edge Function] Exceção:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || "Erro interno ao processar pagamento.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
