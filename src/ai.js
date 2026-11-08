const CLAUDE_MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const GEMINI_MODEL = () => process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

async function gemini(key, system, user) {
  const base = process.env.GEMINI_BASE || 'https://generativelanguage.googleapis.com';
  const res = await fetch(`${base}/v1beta/models/${GEMINI_MODEL()}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 800 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini request failed with ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).candidates[0].content.parts.map((p) => p.text ?? '').join('');
}

async function claude(key, system, user) {
  const res = await fetch(`${process.env.ANTHROPIC_BASE || 'https://api.anthropic.com'}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: CLAUDE_MODEL(), max_tokens: 800, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error(`Claude request failed with ${res.status}`);
  return (await res.json()).content.map((c) => c.text ?? '').join('');
}

export const aiMode = () => (process.env.GEMINI_API_KEY ? 'gemini' : process.env.ANTHROPIC_API_KEY ? 'claude' : 'off');

/** Asks the configured model for JSON. Returns null when AI is off or the call fails. */
export async function askJson(system, user) {
  const mode = aiMode();
  if (mode === 'off') return null;
  const prompt = `${system}\nReply with one JSON object and nothing else.`;
  try {
    const text = mode === 'gemini'
      ? await gemini(process.env.GEMINI_API_KEY, prompt, user)
      : await claude(process.env.ANTHROPIC_API_KEY, prompt, user);
    return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch (err) {
    console.error(err.message);
    return null;
  }
}
