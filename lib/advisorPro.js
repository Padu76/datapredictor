export async function getAdvisorPro(payload) {
  const resp = await fetch('/api/advice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error('Advisor API error: ' + t);
  }
  return await resp.json();
}
