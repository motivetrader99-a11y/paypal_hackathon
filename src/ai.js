/** Calls Claude for a JSON answer. Returns null when no key is set or the call fails. */
export async function askJson(system, user) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${process.env.ANTHROPIC_BASE || 'https://api.anthropic.com'}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: 800,
        system: `${system}\nReply with one JSON object and nothing else.`,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) throw new Error(`AI request failed with ${res.status}`);
    const text = (await res.json()).content.map((c) => c.text ?? '').join('');
    return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch (err) {
    console.error(err.message);
    return null;
  }
}
