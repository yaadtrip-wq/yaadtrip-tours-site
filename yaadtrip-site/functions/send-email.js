// functions/send-email.js
export default async function handler(request, env, ctx) {
  // Only allow POST from your site
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const body = await request.json();
    const { to, subject, html } = body;

    // Basic validation
    if (!to || !Array.isArray(to) || to.length === 0 || !subject || !html) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Send via Resend
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Yaadtrip Tours <support@yaadtriptours.com>',
        to,
        subject,
        html,
      }),
    });

    const result = await resendRes.json();

    if (!resendRes.ok) {
      console.error('Resend failed:', result);
      return new Response(JSON.stringify({ error: result.message || 'Email send failed' }), {
        status: resendRes.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Worker error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}

// Required for edge runtime
export const config = { runtime: 'edge' };